const wppconnect = require("@wppconnect-team/wppconnect");
const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");

const SESSION_NAME = "inter-academy-session";
// Mutlak yol: PM2/Docker restart'larinda calisma dizini degisse bile oturum ayni yerde kalir.
// NOT: Mevcut/canli oturum zaten "tokens/inter-academy-session/" altinda duruyor — burasi
// bilerek DEGISTIRILMEDI, aksi halde restart'ta mevcut giris kaybolup tekrar QR gerekirdi.
const SESSION_DIR = path.resolve(__dirname, "..", "tokens");
// WPPConnect'in gercek tarayici profilini yazdigi klasor (SESSION_DIR/SESSION_NAME).
// Kilitlenmis/bozuk oturumu temizlerken SESSION_DIR'in tamamini degil, sadece bunu silmeliyiz.
const BROWSER_DATA_DIR = path.join(SESSION_DIR, SESSION_NAME);
const QR_PATH = path.join(SESSION_DIR, "qr-latest.png");
// Chromium ayni profil klasorunu baska bir surecin kullandigini sanip acilamadiginda
// biraktigi kilit dosyalari — kesilen/zorla oldurulen restart'lardan sonra kalabilir.
const STALE_LOCK_FILES = ["SingletonLock", "SingletonCookie", "SingletonSocket"];
// Art arda bu kadar baglanti denemesi basarisiz olursa (ör. bozuk tarayici profili
// yuzunden surekli timeout), profil klasoru tamamen sifirlanip temiz QR uretilir.
const MAX_CONSECUTIVE_FAILURES_BEFORE_WIPE = 3;

// NOT: "--single-process" (ve onunla birlikte kullanilan "--no-zygote") bilerek YOK —
// yeni Chromium surumlerinde headless modda resmi olarak desteklenmiyor ve sayfa
// yuklenirken "Waiting failed: 30000ms exceeded" / "Auto Close Called" turu donmalara
// yol actigi VPS'te gozlemlendi. Bellek optimizasyonu icin gerekirse yerine
// "--disable-features=site-per-process" gibi daha guvenli bir bayrak eklenebilir.
const PUPPETEER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-accelerated-2d-canvas",
  "--no-first-run",
  "--disable-gpu",
];

const MAX_QR_ATTEMPTS = 5;
const MAX_RECONNECT_ATTEMPTS = 8;
const BACKOFF_BASE_MS = 2000;
const BACKOFF_MAX_MS = 60000;

const stateEmitter = new EventEmitter();

let whatsappClient = null;
let isInitializing = false;
let reconnectAttempts = 0;
let consecutiveFailures = 0;
let reconnectTimer = null;

let currentState = {
  status: "DISCONNECTED",
  qrBase64: null,
  attempt: 0,
  maxAttempts: MAX_QR_ATTEMPTS,
  lastError: null,
  lastConnectedAt: null,
};

function setState(patch) {
  currentState = { ...currentState, ...patch };
  stateEmitter.emit("change", currentState);
}

function getState() {
  return currentState;
}

function onStateChange(listener) {
  stateEmitter.on("change", listener);
}

function offStateChange(listener) {
  stateEmitter.off("change", listener);
}

function ensureSessionDirAccess() {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  try {
    fs.accessSync(SESSION_DIR, fs.constants.R_OK | fs.constants.W_OK);
  } catch (err) {
    throw new Error(
      `WhatsApp oturum dizinine okuma/yazma izni yok (${SESSION_DIR}). Sunucu kullanıcısının izinlerini kontrol edin.`
    );
  }
}

// Zorla oldurulen/kesilen restart'lardan sonra Chromium'un profil klasorunde birakabildigi
// kilit dosyalarini temizler — aksi halde yeni tarayici sureci profili "kullanimda" sanip
// acilamaz ve sayfa hic yuklenmeden timeout'a duser.
function removeStaleLockFiles() {
  for (const name of STALE_LOCK_FILES) {
    const p = path.join(BROWSER_DATA_DIR, name);
    try {
      if (fs.existsSync(p)) {
        fs.rmSync(p, { force: true });
        console.warn(`[whatsapp] Eski kilit dosyası temizlendi: ${p}`);
      }
    } catch (err) {
      console.error(`[whatsapp] Kilit dosyası temizlenemedi (${p}):`, err.message);
    }
  }
}

// Tarayici profili gercekten bozulmussa (surekli timeout/Auto Close Called) kilit dosyasi
// temizligi yetmez — profili tamamen silip temiz bir QR akisiyla sifirdan baslamak gerekir.
function wipeCorruptedSession(reason) {
  console.error(`[whatsapp] Oturum profili bozuk görünüyor (${reason}), temiz QR için sıfırlanıyor: ${BROWSER_DATA_DIR}`);
  try {
    fs.rmSync(BROWSER_DATA_DIR, { recursive: true, force: true });
  } catch (err) {
    console.error("[whatsapp] Oturum profili sıfırlanamadı:", err.message);
  }
}

// WPPConnect'in dondurdugu statusFind string'lerini kendi state machine'imize esler.
function mapStatusFind(statusSession) {
  switch (statusSession) {
    case "isLogged":
    case "inChat":
    case "successChat":
      return { status: "CONNECTED", lastConnectedAt: Date.now(), lastError: null };
    case "qrReadSuccess":
      return { status: "AUTHENTICATING" };
    case "notLogged":
      return { status: "INITIALIZING" };
    case "qrReadError":
      return { status: "DISCONNECTED_UNEXPECTED", lastError: "QR okutma başarısız oldu" };
    case "desconnectedMobile":
      return { status: "DISCONNECTED_UNEXPECTED", lastError: "Telefon bağlantısı kesildi" };
    case "browserClose":
      return { status: "DISCONNECTED_UNEXPECTED", lastError: "Tarayıcı süreci kapandı" };
    case "deviceNotConnected":
      return { status: "DISCONNECTED", lastError: "Cihaz bağlı değil" };
    case "autocloseCalled":
      return { status: "DISCONNECTED", lastError: "QR süresi doldu, oturum kapatıldı" };
    default:
      return null;
  }
}

// whatsapp-web.js soyundan gelen internal client state'leri (onStateChange).
function mapClientState(state) {
  switch (state) {
    case "CONFLICT":
    case "UNPAIRED":
    case "UNPAIRED_IDLE":
      return { status: "CONFLICT", lastError: "Başka bir yerden oturum açıldı" };
    case "CONNECTED":
      return { status: "CONNECTED", lastConnectedAt: Date.now(), lastError: null };
    case "DISCONNECTED":
    case "TIMEOUT":
      return { status: "DISCONNECTED_UNEXPECTED", lastError: `Bağlantı koptu (${state})` };
    default:
      return null;
  }
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(reason) {
  if (isInitializing || reconnectTimer) return;

  reconnectAttempts += 1;
  if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
    console.error(
      `[whatsapp] ${MAX_RECONNECT_ATTEMPTS} deneme sonrası otomatik yeniden bağlanma durduruldu. Yönetici panelden "Yeniden Başlat" gerekli.`
    );
    setState({ lastError: "Otomatik yeniden bağlanma denemeleri tükendi, manuel yeniden başlatma gerekiyor." });
    return;
  }

  const delay = Math.min(BACKOFF_BASE_MS * 2 ** (reconnectAttempts - 1), BACKOFF_MAX_MS);
  console.warn(`[whatsapp] Yeniden bağlanma planlandı (${delay}ms sonra, deneme ${reconnectAttempts}). Neden: ${reason}`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startSession().catch((err) => console.error("[whatsapp] Yeniden bağlanma denemesi başarısız:", err));
  }, delay);
}

async function startSession() {
  if (isInitializing) {
    console.warn("[whatsapp] Başlatma zaten sürüyor, tekrar çağrı yok sayıldı.");
    return whatsappClient;
  }

  isInitializing = true;
  clearReconnectTimer();
  setState({ status: "INITIALIZING", lastError: null });

  try {
    ensureSessionDirAccess();
  } catch (err) {
    console.error("[whatsapp]", err.message);
    setState({ status: "DISCONNECTED", lastError: err.message });
    isInitializing = false;
    return null;
  }

  removeStaleLockFiles();

  try {
    const client = await wppconnect.create({
      session: SESSION_NAME,
      folderNameToken: SESSION_DIR,
      catchQR: (base64Qr, asciiQR, attempt) => {
        console.log("[whatsapp] QR kodu okutmak icin taratin:");
        console.log(asciiQR);
        try {
          const data = base64Qr.replace(/^data:image\/\w+;base64,/, "");
          fs.mkdirSync(path.dirname(QR_PATH), { recursive: true });
          fs.writeFileSync(QR_PATH, Buffer.from(data, "base64"));
        } catch (qrErr) {
          console.error("[whatsapp] QR PNG kaydedilemedi:", qrErr);
        }
        setState({
          status: "QR_READY",
          qrBase64: base64Qr,
          attempt: attempt ?? currentState.attempt + 1,
          maxAttempts: MAX_QR_ATTEMPTS,
        });
      },
      statusFind: (statusSession) => {
        console.log(`[whatsapp] Oturum durumu: ${statusSession}`);
        const patch = mapStatusFind(statusSession);
        if (patch) setState(patch);
      },
      headless: true,
      puppeteerOptions: { args: PUPPETEER_ARGS },
      logQR: false,
      autoClose: 0,
      // WPPConnect varsayilan olarak eski/sabit bir WhatsApp WEB surumune ("2.3000.10305x")
      // zorlamaya calisiyor; bu surum artik WhatsApp tarafinda mevcut olmadigi icin "latest"e
      // dusuyor ve bu zorla surum degistirme adimi sayfayi yeniden yukleyip enjeksiyon
      // baglamini (execution context) bozarak "wapi.js failed" / 30sn timeout'a yol aciyordu.
      // Bos string birakmak, zorla bir surum dayatmadan mevcut/guncel surumun kullanilmasini
      // saglar (kutuphanenin kendi dokumantasyonundaki davranis).
      whatsappVersion: "",
    });

    whatsappClient = client;
    reconnectAttempts = 0;
    consecutiveFailures = 0;
    setState({ status: "CONNECTED", qrBase64: null, lastConnectedAt: Date.now(), lastError: null });
    console.log("[whatsapp] Baglanti basariyla kuruldu.");

    client.onStateChange((state) => {
      console.log(`[whatsapp] Client state degisti: ${state}`);
      const patch = mapClientState(state);
      if (patch) {
        setState(patch);
        if (patch.status === "DISCONNECTED_UNEXPECTED" || patch.status === "CONFLICT") {
          scheduleReconnect(`client.onStateChange -> ${state}`);
        }
      }
    });

    return client;
  } catch (error) {
    console.error("[whatsapp] Baglanti kurulurken hata olustu:", error);
    consecutiveFailures += 1;
    setState({ status: "DISCONNECTED_UNEXPECTED", lastError: error.message });

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES_BEFORE_WIPE) {
      wipeCorruptedSession(error.message);
      consecutiveFailures = 0;
    }

    scheduleReconnect("startSession hatası");
    return null;
  } finally {
    isInitializing = false;
  }
}

async function requestReconnect() {
  reconnectAttempts = 0;
  consecutiveFailures = 0;
  clearReconnectTimer();
  return startSession();
}

async function logoutSession() {
  clearReconnectTimer();
  reconnectAttempts = 0;
  consecutiveFailures = 0;

  if (whatsappClient) {
    try {
      await whatsappClient.logout();
    } catch (err) {
      console.error("[whatsapp] Logout sırasında hata (yok sayıldı):", err.message);
    }
  }
  whatsappClient = null;

  try {
    // Sadece bu oturumun profil klasorunu sil — SESSION_DIR'in tamami degil (icinde
    // qr-latest.png de var, ve ileride baska session'lar da barinabilir).
    fs.rmSync(BROWSER_DATA_DIR, { recursive: true, force: true });
  } catch (err) {
    console.error("[whatsapp] Oturum dizini temizlenemedi:", err.message);
  }

  setState({ status: "DISCONNECTED", qrBase64: null, attempt: 0, lastConnectedAt: null, lastError: null });

  return startSession();
}

async function initWhatsApp() {
  return startSession();
}

function getWhatsAppClient() {
  return whatsappClient;
}

module.exports = {
  initWhatsApp,
  getWhatsAppClient,
  getState,
  onStateChange,
  offStateChange,
  requestReconnect,
  logoutSession,
};
