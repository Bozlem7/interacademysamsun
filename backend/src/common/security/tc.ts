import crypto from "node:crypto";
import { z } from "zod";
import { env } from "../../config/env";

// TC kimlik no asla plaintext saklanmaz.
// - tcHash: deterministik SHA-256 -> lookup/login/unique constraint icin
// - encrypt/decrypt: AES-256-GCM, geri donusturulebilir -> sadece admin panelinde
//   maskelenmis gosterim icin (orn. "123****901"), asla API yanitinda ham donmez.

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const hex = env.tcEncryptionKey.replace(/[^0-9a-fA-F]/g, "");
  const key = Buffer.from(hex.padEnd(64, "0").slice(0, 64), "hex");
  if (key.length !== 32) throw new Error("TC_ENCRYPTION_KEY must resolve to 32 bytes");
  return key;
}

export function hashTc(tcNo: string): string {
  return crypto.createHash("sha256").update(tcNo.trim()).digest("hex");
}

export function encryptTc(tcNo: string): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(tcNo.trim(), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // layout: iv(12) | authTag(16) | ciphertext
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptTc(payload: Buffer): string {
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

export function maskTc(tcNo: string): string {
  if (tcNo.length < 6) return "*".repeat(tcNo.length);
  return `${tcNo.slice(0, 3)}${"*".repeat(tcNo.length - 6)}${tcNo.slice(-3)}`;
}

export function isValidTcFormat(tcNo: string): boolean {
  return /^[0-9]{11}$/.test(tcNo);
}

/** Standard TCKN checksum algorithm (11 digits, no leading zero, digit-10/digit-11 checksums). */
export function isValidTc(tcNo: string): boolean {
  if (!isValidTcFormat(tcNo)) return false;
  if (tcNo[0] === "0") return false;

  const digits = tcNo.split("").map(Number);
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7];

  const digit10 = (oddSum * 7 - evenSum) % 10;
  const digit11 = (oddSum + evenSum + digits[9]) % 10;

  return digit10 === digits[9] && digit11 === digits[10];
}

export const tcNoSchema = z
  .string()
  .regex(/^[0-9]{11}$/, "TC kimlik numarası 11 haneli olmalıdır")
  .refine(isValidTc, "Geçersiz TC kimlik numarası");
