import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { validateBody } from "../../common/middleware/validate";
import { loginParent, loginStaffOrAdmin } from "./auth.service";

export const authRouter = Router();

// Brute-force / credential-stuffing koruması — OWASP A07 (Identification and Authentication
// Failures). Önceden hiçbir istek sınırı yoktu. 30 saniyede 5 başarısız denemeden sonra o IP
// kısa süreliğine kilitlenir; `skipSuccessfulRequests` sayesinde doğru bilgiyle giren gerçek
// kullanıcılar etkilenmez. NOT: bu kısa pencere kullanıcı deneyimini önceliklendirir — pencere
// dolunca sayaç sıfırlandığı için saatlik izin verilen deneme sayısı (~5 x 120 = 600/saat),
// daha uzun pencereli bir ayara (ör. 10 deneme/15dk = 40/saat) göre belirgin şekilde daha
// zayıf bir brute-force koruması sağlar — bilinçli bir UX/güvenlik ödünleşimi.
const loginRateLimiter = rateLimit({
  windowMs: 30 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: { code: "TOO_MANY_REQUESTS", message: "Çok fazla başarısız giriş denemesi. Lütfen 30 saniye sonra tekrar deneyin." } },
});

const staffLoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  branchCode: z.string().min(1),
});

authRouter.post("/staff-login", loginRateLimiter, validateBody(staffLoginSchema), async (req, res) => {
  const result = await loginStaffOrAdmin(req.body.username, req.body.password, req.body.branchCode);
  res.json(result);
});

authRouter.post("/admin-login", loginRateLimiter, validateBody(staffLoginSchema), async (req, res) => {
  const result = await loginStaffOrAdmin(req.body.username, req.body.password, req.body.branchCode);
  res.json(result);
});

const parentLoginSchema = z.object({
  tcNo: z.string().min(11).max(11),
  branchCode: z.string().min(1),
});

authRouter.post("/parent-login", loginRateLimiter, validateBody(parentLoginSchema), async (req, res) => {
  const result = await loginParent(req.body.tcNo, req.body.branchCode);
  res.json(result);
});
