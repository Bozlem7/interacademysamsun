import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { UserRole } from "@prisma/client";

export interface AuthTokenPayload {
  sub: string; // user id
  role: UserRole;
  staffId?: string;
  studentId?: string;
  /** Active branch for this session — always present after login (admin picks it at login too). */
  branchId: string;
  branchCode: string;
  /** Diyetisyen/psikolog için true: şube bağımsız çalışır, veri erişimi tek bir branchId ile sınırlanmaz. */
  isGlobalStaff?: boolean;
}

export function signToken(payload: AuthTokenPayload): string {
  const options: jwt.SignOptions = { expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"] };
  return jwt.sign(payload, env.jwtSecret, options);
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
}
