import "express-async-errors";
import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { apiRouter } from "./routes";
import { errorHandler, notFoundHandler } from "./common/middleware/errorHandler";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
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
