import { Server, Socket } from "socket.io";
import { verifyToken } from "../../common/security/jwt";

// WPPConnect/Puppeteer istemcisi proje kökünde düz JS olarak yazıldı (bkz. services/whatsappClient.js).
const whatsappClient = require("../../../services/whatsappClient");

interface WhatsAppState {
  status: string;
  qrBase64: string | null;
  attempt: number;
  maxAttempts: number;
  lastError: string | null;
  lastConnectedAt: number | null;
}

function emitSnapshot(target: Socket | Server, state: WhatsAppState) {
  target.emit("wp:status", { status: state.status, timestamp: Date.now(), message: state.lastError ?? undefined });
  if (state.status === "QR_READY" && state.qrBase64) {
    target.emit("wp:qr", { qrBase64: state.qrBase64, attempt: state.attempt, maxAttempts: state.maxAttempts });
  }
  if (state.lastError) {
    target.emit("wp:error", { code: state.status, message: state.lastError });
  }
}

export function registerWhatsAppGateway(io: Server) {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) throw new Error("Token yok");
      const payload = verifyToken(token);
      if (payload.role !== "yonetici") throw new Error("Yetkisiz rol");
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    emitSnapshot(socket, whatsappClient.getState());

    socket.on("wp:request_status", () => {
      emitSnapshot(socket, whatsappClient.getState());
    });

    socket.on("wp:reconnect", async () => {
      await whatsappClient.requestReconnect();
    });

    socket.on("wp:logout", async () => {
      await whatsappClient.logoutSession();
    });
  });

  whatsappClient.onStateChange((state: WhatsAppState) => {
    emitSnapshot(io, state);
  });
}
