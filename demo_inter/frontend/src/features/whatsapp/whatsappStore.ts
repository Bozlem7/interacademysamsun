import { create } from "zustand";

export type WhatsAppStatus =
  | "DISCONNECTED"
  | "INITIALIZING"
  | "QR_READY"
  | "AUTHENTICATING"
  | "CONNECTED"
  | "CONFLICT"
  | "DISCONNECTED_UNEXPECTED";

export const DISCONNECTED_STATUSES: WhatsAppStatus[] = ["DISCONNECTED", "CONFLICT", "DISCONNECTED_UNEXPECTED"];

interface WhatsAppState {
  status: WhatsAppStatus;
  qrBase64: string | null;
  attempt: number;
  maxAttempts: number;
  lastError: string | null;
  lastConnectedAt: number | null;
  highlight: boolean;
  setStatus: (status: WhatsAppStatus, message?: string) => void;
  setQr: (qrBase64: string, attempt: number, maxAttempts: number) => void;
  setError: (message: string) => void;
  triggerHighlight: () => void;
}

export const useWhatsAppStore = create<WhatsAppState>()((set) => ({
  status: "DISCONNECTED",
  qrBase64: null,
  attempt: 0,
  maxAttempts: 5,
  lastError: null,
  lastConnectedAt: null,
  highlight: false,
  setStatus: (status, message) =>
    set((s) => ({
      status,
      lastError: message ?? (status === "CONNECTED" ? null : s.lastError),
      qrBase64: status === "CONNECTED" || status === "INITIALIZING" ? null : s.qrBase64,
      lastConnectedAt: status === "CONNECTED" ? Date.now() : s.lastConnectedAt,
    })),
  setQr: (qrBase64, attempt, maxAttempts) => set({ qrBase64, attempt, maxAttempts }),
  setError: (message) => set({ lastError: message }),
  triggerHighlight: () => {
    set({ highlight: true });
    setTimeout(() => set({ highlight: false }), 2500);
  },
}));
