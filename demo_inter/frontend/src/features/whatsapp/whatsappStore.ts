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

export interface WhatsAppDiagnosticStep {
  step: string;
  timestamp: number;
  durationMs: number | null;
  detail: string | null;
}

/** Backend adım kodlarının panelde gösterilecek Türkçe karşılığı. */
export const DIAGNOSTIC_STEP_LABEL: Record<string, string> = {
  baslatiliyor: "Bağlantı başlatılıyor",
  auth_dosyalari_yuklendi: "Oturum dosyaları okundu",
  wa_surumu_alindi: "WhatsApp sürümü alındı",
  socket_olusturuldu: "Bağlantı soketi oluşturuldu",
  websocket_baglaniyor: "Sunucuya bağlanıyor",
  qr_uretildi: "QR kod üretildi",
  baglandi: "Bağlandı",
  baglanti_koptu: "Bağlantı koptu",
  baslatma_hatasi: "Başlatma hatası",
  dizin_izni_hatasi: "Dizin izni hatası",
  qr_donusturme_hatasi: "QR dönüştürme hatası",
};

interface WhatsAppState {
  status: WhatsAppStatus;
  qrBase64: string | null;
  attempt: number;
  maxAttempts: number;
  lastError: string | null;
  lastConnectedAt: number | null;
  /** En son tanı adımı — "sunucu şu an ne yapıyor" bilgisini canlı göstermek için. */
  lastDiagnosticStep: WhatsAppDiagnosticStep | null;
  /** Son N tanı adımı — bağlantı başarısız olduğunda "neler oldu" özeti (ekran görüntüsü yerine geçer). */
  diagnosticSteps: WhatsAppDiagnosticStep[];
  /** Mevcut bağlantı denemesinin başladığı an (ilk "baslatiliyor" adımı) — geçen süre sayacı için. */
  sessionStartedAt: number | null;
  setStatus: (status: WhatsAppStatus, message?: string) => void;
  setQr: (qrBase64: string, attempt: number, maxAttempts: number) => void;
  setError: (message: string) => void;
  addDiagnosticStep: (step: WhatsAppDiagnosticStep) => void;
}

const MAX_DIAGNOSTIC_STEPS_SHOWN = 30;

export const useWhatsAppStore = create<WhatsAppState>()((set) => ({
  status: "DISCONNECTED",
  qrBase64: null,
  attempt: 0,
  maxAttempts: 5,
  lastError: null,
  lastConnectedAt: null,
  lastDiagnosticStep: null,
  diagnosticSteps: [],
  sessionStartedAt: null,
  setStatus: (status, message) =>
    set((s) => ({
      status,
      lastError: message ?? (status === "CONNECTED" ? null : s.lastError),
      qrBase64: status === "CONNECTED" || status === "INITIALIZING" ? null : s.qrBase64,
      lastConnectedAt: status === "CONNECTED" ? Date.now() : s.lastConnectedAt,
    })),
  setQr: (qrBase64, attempt, maxAttempts) => set({ qrBase64, attempt, maxAttempts }),
  setError: (message) => set({ lastError: message }),
  addDiagnosticStep: (step) =>
    set((s) => ({
      lastDiagnosticStep: step,
      diagnosticSteps: [...s.diagnosticSteps, step].slice(-MAX_DIAGNOSTIC_STEPS_SHOWN),
      sessionStartedAt: step.step === "baslatiliyor" ? step.timestamp : s.sessionStartedAt,
    })),
}));
