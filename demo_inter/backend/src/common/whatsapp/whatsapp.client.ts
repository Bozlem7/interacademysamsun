import { env } from "../../config/env";

/**
 * Meta WhatsApp Business Cloud API üzerinden mesaj gönderen ince istemci.
 * Kimlik bilgileri (.env) tanımlı değilse (local/dev) log-only stub'a düşer, böylece
 * geri kalan sistem (ödemeler, yoklama) canlı bir WhatsApp hesabı olmadan da test edilebilir.
 */

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: number;
}

const TR_NUMBER_REGEX = /^90\d{10}$/;

/**
 * '0532 123 45 67', '+90 532 123 45 67', '532-123-45-67' gibi girdileri Cloud API'nin
 * beklediği E.164 (ülke koduyla, '+' ve boşluksuz) formata çevirir: '905321234567'.
 * Numara eksik/geçersizse null döner.
 */
export function sanitizePhoneNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;

  let digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  if (!digits.startsWith("90")) {
    digits = `90${digits}`;
  }

  return TR_NUMBER_REGEX.test(digits) ? digits : null;
}

function graphApiUrl(path: string): string {
  return `https://graph.facebook.com/${env.whatsapp.apiVersion}/${path}`;
}

/** Graph API hata gövdesini { message, code } olarak ayrıştırır (rate limit, geçersiz numara, yetki hatası vb.). */
async function parseGraphError(res: Response): Promise<{ message: string; code?: number }> {
  try {
    const body = (await res.json()) as any;
    const err = body?.error;
    if (err) {
      return { message: `${err.message ?? "Bilinmeyen hata"} (Meta code ${err.code}${err.error_subcode ? `/${err.error_subcode}` : ""})`, code: err.code };
    }
    return { message: `HTTP ${res.status}` };
  } catch {
    return { message: `HTTP ${res.status}` };
  }
}

async function postMessage(payload: Record<string, unknown>): Promise<WhatsAppSendResult> {
  if (!env.whatsapp.apiToken || !env.whatsapp.phoneNumberId) {
    console.info(`[whatsapp:stub] -> ${JSON.stringify(payload)}`);
    return { success: true, messageId: "stub" };
  }

  try {
    const res = await fetch(graphApiUrl(`${env.whatsapp.phoneNumberId}/messages`), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.whatsapp.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    });

    if (!res.ok) {
      const { message, code } = await parseGraphError(res);
      // 130429/4 = rate limit, 131026 = numara WhatsApp'ta değil, 190 = token süresi dolmuş/geçersiz.
      console.error(`[whatsapp] Gönderim başarısız (${res.status}):`, message);
      return { success: false, error: message, errorCode: code };
    }

    const data = (await res.json()) as any;
    const messageId = data?.messages?.[0]?.id;
    console.info(`[whatsapp] Mesaj gönderildi -> ${payload.to} (id: ${messageId})`);
    return { success: true, messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen ağ hatası";
    console.error("[whatsapp] İstek atılamadı:", message);
    return { success: false, error: message };
  }
}

/** Serbest metin gönderir. Not: Cloud API, alıcı son 24 saat içinde size mesaj atmadıysa serbest metne izin vermez — bu durumda onaylı bir şablon (template) kullanılmalıdır. */
export async function sendWhatsAppMessage(toPhone: string, message: string): Promise<WhatsAppSendResult> {
  const to = sanitizePhoneNumber(toPhone);
  if (!to) {
    console.error(`[whatsapp] Geçersiz telefon numarası, mesaj gönderilemedi: ${toPhone}`);
    return { success: false, error: "Geçersiz telefon numarası" };
  }

  return postMessage({ to, type: "text", text: { body: message } });
}

export interface TemplateComponent {
  type: "header" | "body" | "button";
  parameters: Array<{ type: "text"; text: string }>;
}

/**
 * Onaylı bir mesaj şablonu (Meta panelinde önceden oluşturulmuş) gönderir. 24 saatlik
 * müşteri hizmetleri penceresinin dışında (örn. otomatik hatırlatmalar) tek geçerli yöntem budur.
 */
export async function sendWhatsAppTemplate(
  toPhone: string,
  templateName: string,
  languageCode = "tr",
  components: TemplateComponent[] = []
): Promise<WhatsAppSendResult> {
  const to = sanitizePhoneNumber(toPhone);
  if (!to) {
    console.error(`[whatsapp] Geçersiz telefon numarası, şablon gönderilemedi: ${toPhone}`);
    return { success: false, error: "Geçersiz telefon numarası" };
  }

  return postMessage({
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length ? { components } : {}),
    },
  });
}
