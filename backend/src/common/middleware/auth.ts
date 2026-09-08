import { NextFunction, Request, Response } from "express";
import { UserRole } from "@prisma/client";
import { verifyToken, AuthTokenPayload } from "../security/jwt";
import { UnauthorizedError, ForbiddenError } from "../errors/AppError";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthTokenPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new UnauthorizedError("Oturum bulunamadı");
  try {
    req.auth = verifyToken(header.slice("Bearer ".length));
    next();
  } catch {
    throw new UnauthorizedError("Oturum geçersiz veya süresi dolmuş");
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) throw new UnauthorizedError();
    if (!roles.includes(req.auth.role)) throw new ForbiddenError();
    next();
  };
}
