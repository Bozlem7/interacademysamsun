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

const stateEmitter = new EventEmitter();
const logger = pino({ level: "silent" });

let whatsappClient = null;
let isInitializing = false;
let reconnectAttempts = 0;
let consecutiveFailures = 0;
let reconnectTimer = null;
let qrAttemptCounter = 0;

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
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      syncFullHistory: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          qrAttemptCounter += 1;
          const qrBase64 = await qrcode.toDataURL(qr);
          console.log("[whatsapp] QR kodu okutmak icin taratin (panelden goruntulenebilir).");
          setState({
            status: "QR_READY",
            qrBase64,
            attempt: qrAttemptCounter,
            maxAttempts: MAX_QR_ATTEMPTS,
          });
        } catch (qrErr) {
          console.error("[whatsapp] QR base64'e cevrilemedi:", qrErr.message);
        }
      }

      if (connection === "connecting") {
        setState({ status: "INITIALIZING" });
      }

      if (connection === "open") {
        whatsappClient = sock;
        reconnectAttempts = 0;
        consecutiveFailures = 0;
        qrAttemptCounter = 0;
        setState({ status: "CONNECTED", qrBase64: null, lastConnectedAt: Date.now(), lastError: null });
        console.log("[whatsapp] Baglanti basariyla kuruldu.");
      }

      if (connection === "close") {
        whatsappClient = null;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reasonText = `Bağlantı koptu (kod: ${statusCode ?? "bilinmiyor"})`;

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
