/**
 * Turkish national ID (TCKN) structural checksum validation — the standard 11-digit algorithm.
 * This validates the number's mathematical structure, not whether it belongs to a real person.
 */
export function isValidTc(raw: string): boolean {
  const tc = (raw || "").trim();
  if (!/^[0-9]{11}$/.test(tc)) return false;
  if (tc[0] === "0") return false;

  const digits = tc.split("").map(Number);
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7];

  const digit10 = (oddSum * 7 - evenSum) % 10;
  const digit11 = (oddSum + evenSum + digits[9]) % 10;

  return digit10 === digits[9] && digit11 === digits[10];
}

export function tcErrorMessage(raw: string): string | null {
  if (!raw) return null;
  if (!/^[0-9]{11}$/.test(raw)) return "TC kimlik numarası 11 haneli olmalıdır";
  if (!isValidTc(raw)) return "Geçersiz TC kimlik numarası";
  return null;
}
