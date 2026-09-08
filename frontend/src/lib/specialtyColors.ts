export type Specialty = "antrenor" | "diyetisyen" | "psikolog";

/** Global branş renk kimliği — tüm panellerde (rozet, not kartı, takvim) sabit kullanılır. */
export const SPECIALTY_LABEL: Record<Specialty, string> = {
  antrenor: "Antrenör",
  diyetisyen: "Diyetisyen",
  psikolog: "Psikolog",
};

export const SPECIALTY_BADGE_CLASS: Record<Specialty, string> = {
  antrenor: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
  diyetisyen: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  psikolog: "bg-amber-400/15 text-amber-400 border border-amber-400/30",
};

export const SPECIALTY_BORDER_CLASS: Record<Specialty, string> = {
  antrenor: "border-l-4 border-l-blue-500",
  diyetisyen: "border-l-4 border-l-emerald-500",
  psikolog: "border-l-4 border-l-amber-400",
};

/** StudentNote.category ("antrenor_gorusu" vb.) -> branş. */
export function categoryToSpecialty(category: string): Specialty {
  if (category.startsWith("diyetisyen")) return "diyetisyen";
  if (category.startsWith("psikolog")) return "psikolog";
  return "antrenor";
}

/** TrainingSession.sessionType ("saha" | "diyet" | "psikolog") -> branş. */
export function sessionTypeToSpecialty(sessionType: string): Specialty {
  if (sessionType === "diyet") return "diyetisyen";
  if (sessionType === "psikolog") return "psikolog";
  return "antrenor";
}

export interface SpecialtyTheme {
  /** Üst bardaki oturum rozeti ("Ad Soyad · Branş Oturumu"). */
  badge: string;
  /** Aktif sekme butonu ve panel içindeki birincil eylem butonları. */
  activeTab: string;
  /** Odaklanan (focus) input / select / textarea çerçevesi. */
  focusRing: string;
  /** Nötr bilgilendirme kutuları (örn. "önce bir sınıf seçin"). */
  infoBox: string;
}

/**
 * Eğitmen paneli (/egitmen/panel) branşa göre dinamik temalanır — antrenör mevcut
 * kurumsal mavide kalır, diyetisyen yeşile, psikolog sarı/kehribara döner.
 */
export const SPECIALTY_THEME: Record<Specialty, SpecialtyTheme> = {
  antrenor: {
    badge: "bg-[#010E80]/20 text-blue-400 border border-blue-500/40",
    activeTab: "bg-[#010E80] hover:bg-brand-hover text-white",
    focusRing: "focus:border-[#010E80] focus:ring-2 focus:ring-blue-500/20",
    // Spec'teki koyu-zemin renkleri (bg-*-950/20 + text-*-200) dark mode'da aynen korunur;
    // light mode'da aynı ton okunaklı kalsın diye ayrıca açık zemin varyantı eklendi.
    infoBox: "border-l-4 border-l-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/20 dark:text-blue-200",
  },
  diyetisyen: {
    badge: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40",
    activeTab: "bg-emerald-600 hover:bg-emerald-500 text-white",
    focusRing: "focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20",
    infoBox: "border-l-4 border-l-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200",
  },
  psikolog: {
    badge: "bg-amber-400/20 text-amber-300 border border-amber-400/40",
    activeTab: "bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold",
    focusRing: "focus:border-amber-500 focus:ring-2 focus:ring-amber-400/20",
    infoBox: "border-l-4 border-l-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/20 dark:text-amber-200",
  },
};
