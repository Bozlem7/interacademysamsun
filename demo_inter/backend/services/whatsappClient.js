const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");

// Baileys'in oturum verisi (Signal protokolu anahtarlari) WPPConnect'in Chromium tarayici
// profiliyle uyumsuz oldugu icin bilerek ayri, yeni bir klasor kullaniliyor. Mutlak yol:
// PM2/Docker restart'larinda calisma dizini degisse bile oturum ayni yerde kalir.
const SESSION_DIR = path.resolve(__dirname, "..", "storage", "baileys-auth");

const MAX_QR_ATTEMPTS = 5;
const MAX_RECONNECT_ATTEMPTS = 8;
const BACKOFF_BASE_MS = 2000;
const BACKOFF_MAX_MS = 60000;
// Art arda bu kadar baglanti denemesi basarisiz olursa (ör. bozuk/uyumsuz auth dosyalari
// yuzunden surekli hata), oturum klasoru tamamen sifirlanip temiz QR uretilir.
const MAX_CONSECUTIVE_FAILURES_BEFORE_WIPE = 3;
// Yavas/yuksek gecikmeli aglarda Baileys'in varsayilan 20sn baglanti timeout'u yetersiz
// kalabiliyor — WebSocket el sikismasi ve ilk sorgular icin daha genis bir pencere.
const CONNECT_TIMEOUT_MS = 120000;
const DEFAULT_QUERY_TIMEOUT_MS = 90000;
// Teshis gecmisinde en fazla bu kadar adim tutulur (bellek sisirmesin diye).
const MAX_DIAGNOSTIC_HISTORY = 30;

const stateEmitter = new EventEmitter();
const logger = pino({ level: "silent" });

let whatsappClient = null;
let isInitializing = false;
// isInitializing true iken gelen bir "Yeniden Dene" istegi burada bekletilir; eskiden
// bu durumda istek sessizce yok sayilir, kullaniciya hicbir geri bildirim gitmezdi
// (buton "calismiyormus" gibi görünüyordu). Artik mevcut deneme bitince otomatik tetiklenir.
let pendingRetry = false;
let reconnectAttempts = 0;
let consecutiveFailures = 0;
let reconnectTimer = null;
let qrAttemptCounter = 0;
let sessionStartedAt = null;
let diagnosticHistory = [];

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
  return { ...currentState, diagnosticHistory };
}

function onStateChange(listener) {
  stateEmitter.on("change", listener);
}

function offStateChange(listener) {
  stateEmitter.off("change", listener);
}

function onDiagnostic(listener) {
  stateEmitter.on("diagnostic", listener);
}

function offDiagnostic(listener) {
  stateEmitter.off("diagnostic", listener);
}

// Baglanti surecinin her asamasini (ag/gecikme teshisi icin) zaman damgasiyla kaydeder ve
// canli olarak yayinlar. "detail" ag hatalarini (ör. baglanti koptu, kod X) tasir.
function recordDiagnostic(step, detail) {
  const entry = {
    step,
    timestamp: Date.now(),
    durationMs: sessionStartedAt ? Date.now() - sessionStartedAt : null,
    detail: detail ?? null,
  };
  diagnosticHistory.push(entry);
  if (diagnosticHistory.length > MAX_DIAGNOSTIC_HISTORY) diagnosticHistory.shift();
  console.log(
    `[whatsapp][diagnostic] ${step}${entry.durationMs !== null ? ` (+${entry.durationMs}ms)` : ""}${
      detail ? ` — ${detail}` : ""
    }`
  );
  stateEmitter.emit("diagnostic", entry);
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

// Oturum dosyalari gercekten bozulmussa (surekli baglanti hatasi) sifirlayip temiz bir
// QR akisiyla sifirdan baslamak gerekir.
function wipeCorruptedSession(reason) {
  console.error(`[whatsapp] Oturum bozuk görünüyor (${reason}), temiz QR için sıfırlanıyor: ${SESSION_DIR}`);
  try {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
  } catch (err) {
    console.error("[whatsapp] Oturum dizini sıfırlanamadı:", err.message);
  }
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

// startSession() her cikis noktasinda bunun uzerinden kapanmali — bekleyen bir manuel
// "Yeniden Dene" istegi varsa (bkz. requestReconnect), hemen ardindan yeni bir deneme baslatir.
function finishInitializing() {
  isInitializing = false;
  if (pendingRetry) {
    pendingRetry = false;
    console.warn("[whatsapp] Bekleyen yeniden baglanma istegi simdi tetikleniyor.");
    startSession().catch((err) => console.error("[whatsapp] Kuyruklanmis yeniden baglanma basarisiz:", err));
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
  sessionStartedAt = Date.now();
  diagnosticHistory = [];
  recordDiagnostic("baslatiliyor");
  setState({ status: "INITIALIZING", lastError: null });

  try {
    ensureSessionDirAccess();
  } catch (err) {
    console.error("[whatsapp]", err.message);
    recordDiagnostic("dizin_izni_hatasi", err.message);
    setState({ status: "DISCONNECTED", lastError: err.message });
    finishInitializing();
    return null;
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    recordDiagnostic("auth_dosyalari_yuklendi");

    const { version } = await fetchLatestBaileysVersion();
    recordDiagnostic("wa_surumu_alindi", version.join("."));

    const sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      syncFullHistory: false,
      // Yavas/yuksek gecikmeli VPS aglarinda varsayilan sureler yetersiz kalabiliyor.
      connectTimeoutMs: CONNECT_TIMEOUT_MS,
      defaultQueryTimeoutMs: DEFAULT_QUERY_TIMEOUT_MS,
    });
    recordDiagnostic("socket_olusturuldu");

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          qrAttemptCounter += 1;
          const qrBase64 = await qrcode.toDataURL(qr);
          console.log("[whatsapp] QR kodu okutmak icin taratin (panelden goruntulenebilir).");
          recordDiagnostic("qr_uretildi", `deneme ${qrAttemptCounter}/${MAX_QR_ATTEMPTS}`);
          setState({
            status: "QR_READY",
            qrBase64,
            attempt: qrAttemptCounter,
            maxAttempts: MAX_QR_ATTEMPTS,
          });
        } catch (qrErr) {
          console.error("[whatsapp] QR base64'e cevrilemedi:", qrErr.message);
          recordDiagnostic("qr_donusturme_hatasi", qrErr.message);
        }
      }

      if (connection === "connecting") {
        recordDiagnostic("websocket_baglaniyor");
        setState({ status: "INITIALIZING" });
      }

      if (connection === "open") {
        whatsappClient = sock;
        reconnectAttempts = 0;
        consecutiveFailures = 0;
        qrAttemptCounter = 0;
        recordDiagnostic("baglandi");
        setState({ status: "CONNECTED", qrBase64: null, lastConnectedAt: Date.now(), lastError: null });
        console.log("[whatsapp] Baglanti basariyla kuruldu.");
      }

      if (connection === "close") {
        whatsappClient = null;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errorMessage = lastDisconnect?.error?.message;
        const reasonText = `Bağlantı koptu (kod: ${statusCode ?? "bilinmiyor"})`;
        recordDiagnostic("baglanti_koptu", `kod=${statusCode ?? "?"} mesaj=${errorMessage ?? "?"}`);

        if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
          setState({ status: "DISCONNECTED", lastError: "Oturum geçersiz kılındı, yeni QR gerekiyor." });
          wipeCorruptedSession(reasonText);
          consecutiveFailures = 0;
          scheduleReconnect("oturum gecersiz, temiz QR icin yeniden baslatiliyor");
        } else if (statusCode === DisconnectReason.connectionReplaced) {
          setState({ status: "CONFLICT", lastError: "Başka bir yerden oturum açıldı" });
          scheduleReconnect(reasonText);
        } else {
          consecutiveFailures += 1;
          setState({ status: "DISCONNECTED_UNEXPECTED", lastError: reasonText });

          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES_BEFORE_WIPE) {
            wipeCorruptedSession(reasonText);
            consecutiveFailures = 0;
          }

          scheduleReconnect(reasonText);
        }
      }
    });

    return sock;
  } catch (error) {
    console.error("[whatsapp] Baglanti kurulurken hata olustu:", error);
    recordDiagnostic("baslatma_hatasi", error.message);
    consecutiveFailures += 1;
    setState({ status: "DISCONNECTED_UNEXPECTED", lastError: error.message });

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES_BEFORE_WIPE) {
      wipeCorruptedSession(error.message);
      consecutiveFailures = 0;
    }

    scheduleReconnect("startSession hatası");
    return null;
  } finally {
    finishInitializing();
  }
}

async function requestReconnect() {
  reconnectAttempts = 0;
  consecutiveFailures = 0;
  clearReconnectTimer();

  if (isInitializing) {
    // Mevcut deneme henuz surerken gelen manuel istek artik sessizce kaybolmuyor —
    // finishInitializing() bu deneme bitince otomatik yeni bir baslatma tetikleyecek.
    pendingRetry = true;
    console.warn("[whatsapp] Yeniden bağlanma isteği kuyruğa alındı (mevcut deneme sürüyor).");
    return whatsappClient;
  }

  return startSession();
}

async function logoutSession() {
  clearReconnectTimer();
  reconnectAttempts = 0;
  consecutiveFailures = 0;
  pendingRetry = false;

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
  onDiagnostic,
  offDiagnostic,
  requestReconnect,
  logoutSession,
};
