export const MIN_STUDENT_AGE = 5;

/** Kural: sadece yıl bazlı hesap — Aktif Yıl - Doğum Yılı. Ay/gün dikkate alınmaz. */
export function yearBasedAge(dobStr: string): number {
  const birthYear = new Date(dobStr).getFullYear();
  return new Date().getFullYear() - birthYear;
}

export function ageErrorMessage(dobStr: string): string | null {
  if (!dobStr) return null;
  if (yearBasedAge(dobStr) < MIN_STUDENT_AGE) {
    return "Sporcu yaşı en az 5 olmalıdır.";
  }
  return null;
}
