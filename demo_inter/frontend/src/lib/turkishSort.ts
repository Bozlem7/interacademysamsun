/**
 * Backend'in ORDER BY'ı Türkçe collation garantili değil (Postgres varsayılanı ı/İ/ş/ğ/ö/ü/ç
 * harflerini doğru sıralamayabilir) — kesin doğru Türkçe alfabetik sıra burada garanti edilir.
 */
export function turkishCompare(a: string, b: string): number {
  return (a || "").localeCompare(b || "", "tr", { sensitivity: "base" });
}

export function sortByFullNameTr<T extends { fullName: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => turkishCompare(a.fullName, b.fullName));
}
