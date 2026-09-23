import "express-async-errors";
import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { apiRouter } from "./routes";
import { errorHandler, notFoundHandler } from "./common/middleware/errorHandler";
import { corsOriginHandler } from "./common/security/corsOrigin";

export function createApp() {
  const app = express();

  // Nginx reverse proxy arkasında çalışıyoruz — bu olmadan express-rate-limit (ve genel olarak
  // req.ip) herkesi Nginx'in tek IP'si üzerinden görür, tek bir kullanıcının başarısız giriş
  // denemesi TÜM kullanıcıları aynı anda kilitler. Nginx zaten X-Forwarded-For header'ı
  // gönderiyor (bkz. proxy_set_header X-Forwarded-For), bu ayarla Express ona güvenip gerçek
  // istemci IP'sini kullanır.
  app.set("trust proxy", 1);

  app.use(helmet());
  // credentials:true bilerek kullanılmıyor — kimlik doğrulama JWT Bearer header ile yapılıyor,
  // cookie tabanlı bir oturum yok. Bu sayede CORS_ORIGIN=* (acil teşhis/staging) güvenle çalışır;
  // credentials:true + origin:'*' kombinasyonu tarayıcılar tarafından zaten reddedilir.
  app.use(cors({ origin: corsOriginHandler }));
  app.use(express.json({ limit: "5mb" }));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // Yüklenen görseller (slider vb.) — farklı origin'den (frontend dev server) <img> ile
  // yüklenebilmesi için CORP kısıtını gevşetiyoruz.
  app.use(
    "/uploads",
    (req, res, next) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(path.join(process.cwd(), "uploads"))
  );

  // Birleştirilmiş öğrenci kayıt evrakı PDF'leri (storage/documents/{branch_code}/...).
  // /uploads ile aynı model: dosya adı tahmin edilemeyen öğrenci UUID'sini içerir,
  // link doğrudan yeni sekmede açılabilsin diye (tarayıcı navigasyonu Authorization
  // header'ı taşımaz) ayrı bir oturum kontrolü uygulanmaz.
  app.use(
    "/storage/documents",
    (req, res, next) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(path.join(process.cwd(), "storage", "documents"))
  );

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
