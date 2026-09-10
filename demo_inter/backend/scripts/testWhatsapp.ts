import { sendWhatsAppTemplate } from "../src/common/whatsapp/whatsapp.client";

const to = process.argv[2];
if (!to) {
  console.error("Kullanım: tsx scripts/testWhatsapp.ts <telefon>");
  process.exit(1);
}

sendWhatsAppTemplate(to, "hello_world", "en_US").then((result) => {
  console.log(result);
});
