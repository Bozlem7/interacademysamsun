const wppconnect = require("@wppconnect-team/wppconnect");
const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");

const SESSION_NAME = "inter-academy-session";
// Mutlak yol: PM2/Docker restart'larinda calisma dizini degisse bile oturum ayni yerde kalir.
// NOT: Mevcut/canli oturum zaten "tokens/inter-academy-session/" altinda duruyor — burasi
// bilerek DEGISTIRILMEDI, aksi halde restart'ta mevcut giris kaybolup tekrar QR gerekirdi.
const SESSION_DIR = path.resolve(__dirname, "..", "tokens");
const QR_PATH = path.join(SESSION_DIR, "qr-latest.png");

const PUPPETEER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-accelerated-2d-canvas",
  "--no-first-run",
  "--no-zygote",
  "--single-process",
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
    });

    whatsappClient = client;
    reconnectAttempts = 0;
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
    setState({ status: "DISCONNECTED_UNEXPECTED", lastError: error.message });
    scheduleReconnect("startSession hatası");
    return null;
  } finally {
    isInitializing = false;
  }
}

async function requestReconnect() {
  reconnectAttempts = 0;
  clearReconnectTimer();
  return startSession();
}

async function logoutSession() {
  clearReconnectTimer();
  reconnectAttempts = 0;

  if (whatsappClient) {
    try {
      await whatsappClient.logout();
    } catch (err) {
      console.error("[whatsapp] Logout sırasında hata (yok sayıldı):", err.message);
    }
  }
  whatsappClient = null;

  try {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
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
