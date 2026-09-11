-- Öğrenci başına WhatsApp bildirim tercihleri: anne / baba / vasi-yakın telefonlarından
-- hangisine bildirim (devamsızlık, ödeme hatırlatma vb.) gönderileceğini belirler.
-- Varsayılan false: mevcut kayıtlar için hiçbiri otomatik işaretli gelmez, yönetici
-- panelden veya kayıt formundan bilinçli olarak seçmelidir.
ALTER TABLE "students"
  ADD COLUMN "notify_mother"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "notify_father"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "notify_guardian" BOOLEAN NOT NULL DEFAULT false;
