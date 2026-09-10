import { Router } from "express";
import crypto from "node:crypto";
import { env } from "../../config/env";

export const whatsappWebhookRouter = Router();

/**
 * Meta, webhook URL'ini panelde kaydederken (ve arada bir yeniden) bu GET isteğini atar.
 * hub.verify_token bizim WHATSAPP_VERIFY_TOKEN'imizle eşleşiyorsa hub.challenge'ı aynen geri döneriz.
 */
whatsappWebhookRouter.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && env.whatsapp.verifyToken && token === env.whatsapp.verifyToken) {
    console.info("[whatsapp:webhook] Doğrulama başarılı.");
    return res.status(200).send(challenge);
  }

  console.warn("[whatsapp:webhook] Doğrulama reddedildi (token uyuşmuyor veya WHATSAPP_VERIFY_TOKEN tanımsız).");
  return res.sendStatus(403);
});

/** X-Hub-Signature-256 imzasını app secret ile doğrular. appSecret tanımlı değilse (dev) kontrolü atlar. */
function hasValidSignature(req: import("express").Request): boolean {
  if (!env.whatsapp.appSecret) return true;

  const signature = req.header("x-hub-signature-256");
  const rawBody = (req as any).rawBody as Buffer | undefined;
  if (!signature || !rawBody) return false;

  const expected = "sha256=" + crypto.createHmac("sha256", env.whatsapp.appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Gelen mesajlar (kullanıcı bize yazdığında) ve durum güncellemeleri (sent/delivered/read/failed)
 * buraya POST edilir. Meta 5 saniye içinde 200 bekler; işleme önce yanıt dönülür.
 */
whatsappWebhookRouter.post("/", (req, res) => {
  if (!hasValidSignature(req)) {
    console.warn("[whatsapp:webhook] Geçersiz imza (X-Hub-Signature-256), istek reddedildi.");
    return res.sendStatus(401);
  }

  res.sendStatus(200);

  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;

    for (const msg of value?.messages ?? []) {
      const body = msg.text?.body ?? `[${msg.type}]`;
      console.info(`[whatsapp:webhook] Gelen mesaj <- ${msg.from}: ${body}`);
      // TODO: gelen mesajı DB'ye kaydetmek veya bir handler'a (örn. otomatik yanıt) yönlendirmek istersen buraya ekle.
    }

    for (const status of value?.statuses ?? []) {
      console.info(`[whatsapp:webhook] Durum güncellendi -> ${status.recipient_id}: ${status.status} (mesaj ${status.id})`);
      if (status.status === "failed") {
        console.error(`[whatsapp:webhook] Gönderim başarısız -> ${status.recipient_id}:`, status.errors);
      }
    }
  } catch (err) {
    console.error("[whatsapp:webhook] Event işlenirken hata oluştu:", err);
  }
});
