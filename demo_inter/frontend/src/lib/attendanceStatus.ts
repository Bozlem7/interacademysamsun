export type LessonType = "antrenman" | "diyetisyen" | "psikolog";
export type AttendanceRowStatus = "geldi" | "gelmedi" | "izinli";

export const LESSON_TYPE_LABEL: Record<LessonType, string> = {
  antrenman: "Antrenman",
  diyetisyen: "Diyetisyen",
  psikolog: "Psikolog",
};

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceRowStatus, string> = {
  geldi: "Geldi",
  gelmedi: "Gelmedi",
  izinli: "İzinli/Raporlu",
};

// badge-success / badge-danger / badge-warning renk şeması.
export const ATTENDANCE_STATUS_BADGE_CLASS: Record<AttendanceRowStatus, string> = {
  geldi: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  gelmedi: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  izinli: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

/** "2026-09-16" -> yerel saat dilimi kaymasına takılmadan doğrudan UTC tarih olarak "16.09.2026 Çarşamba". */
export function formatDateWithDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const dayLabel = d.toLocaleDateString("tr-TR", { weekday: "long", timeZone: "UTC" });
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${d.getUTCFullYear()} ${dayLabel}`;
}
