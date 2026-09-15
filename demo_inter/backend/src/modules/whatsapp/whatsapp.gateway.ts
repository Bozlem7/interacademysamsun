import { Server, Socket } from "socket.io";
import { verifyToken } from "../../common/security/jwt";

// Baileys istemcisi proje kökünde düz JS olarak yazıldı (bkz. services/whatsappClient.js).
const whatsappClient = require("../../../services/whatsappClient");

interface DiagnosticStep {
  step: string;
  timestamp: number;
  durationMs: number | null;
  detail: string | null;
}

interface WhatsAppState {
  status: string;
  qrBase64: string | null;
  attempt: number;
  maxAttempts: number;
  lastError: string | null;
  lastConnectedAt: number | null;
  diagnosticHistory: DiagnosticStep[];
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
    const state = whatsappClient.getState();
    emitSnapshot(socket, state);
    for (const step of state.diagnosticHistory as DiagnosticStep[]) {
      socket.emit("wp:diagnostic_step", step);
    }

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

  whatsappClient.onDiagnostic((step: DiagnosticStep) => {
    io.emit("wp:diagnostic_step", step);
  });
}
