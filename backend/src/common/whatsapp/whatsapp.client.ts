import { env } from "../../config/env";

/**
 * Thin wrapper around WhatsApp Business Cloud API. When credentials are not configured
 * (local/dev), falls back to a logging-only stub so the rest of the system (payments,
 * attendance) can be exercised without a live WhatsApp account.
 */
export async function sendWhatsAppMessage(toPhone: string, message: string): Promise<void> {
  if (!env.whatsapp.apiToken || !env.whatsapp.phoneNumberId) {
    console.info(`[whatsapp:stub] -> ${toPhone}: ${message}`);
    return;
  }

  const url = `https://graph.facebook.com/v20.0/${env.whatsapp.phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.whatsapp.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toPhone,
      type: "text",
      text: { body: message },
    }),
  });

  if (!res.ok) {
    console.error("[whatsapp] send failed", res.status, await res.text());
  }
}
