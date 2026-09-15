import { io, Socket } from "socket.io-client";
import { useAuthStore } from "../auth/authStore";
import { useWhatsAppStore, WhatsAppDiagnosticStep, WhatsAppStatus } from "./whatsappStore";

let socket: Socket | null = null;

export function connectWhatsAppSocket() {
  if (socket) return;

  const token = useAuthStore.getState().token;
  if (!token) return;

  socket = io({
    path: "/socket.io",
    auth: { token },
    reconnectionDelay: 2000,
    reconnectionDelayMax: 30000,
  });

  socket.on("connect", () => console.log("[whatsapp] Socket bağlandı:", socket?.id));
  socket.on("connect_error", (err) => console.error("[whatsapp] Socket bağlantı hatası:", err.message));

  socket.on("wp:status", (payload: { status: WhatsAppStatus; message?: string }) => {
    console.log("[whatsapp] wp:status alındı:", payload);
    useWhatsAppStore.getState().setStatus(payload.status, payload.message);
  });

  socket.on("wp:qr", (payload: { qrBase64: string; attempt: number; maxAttempts: number }) => {
    console.log("[whatsapp] wp:qr alındı, uzunluk:", payload.qrBase64?.length, "deneme:", payload.attempt);
    useWhatsAppStore.getState().setQr(payload.qrBase64, payload.attempt, payload.maxAttempts);
  });

  socket.on("wp:error", (payload: { message: string }) => {
    useWhatsAppStore.getState().setError(payload.message);
  });

  socket.on("wp:diagnostic_step", (payload: WhatsAppDiagnosticStep) => {
    useWhatsAppStore.getState().addDiagnosticStep(payload);
  });
}

export function disconnectWhatsAppSocket() {
  socket?.disconnect();
  socket = null;
}

export function requestReconnect() {
  socket?.emit("wp:reconnect");
}

export function requestLogout() {
  socket?.emit("wp:logout");
}
