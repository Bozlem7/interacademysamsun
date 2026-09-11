-- Daha önce kodda sabit/statik duran varsayılan haber banner'ını gerçek bir hero_slides
-- satırına dönüştürür — böylece "Site İçeriği" panelinde diğer slaytlarla birlikte
-- listelenir ve tek tıkla silinebilir. hero_slides tablosu zaten dolu ise (bu migration
-- daha önce çalışmış ya da panelden elle bir slayt eklenmişse) tekrar eklemez.
INSERT INTO "hero_slides" ("id", "image_url", "title", "body", "sort_order", "updated_at")
SELECT
  gen_random_uuid(),
  '/haberinter.png',
  'Yeni Sezon Kayıtları Açıldı',
  'U-7''den U-16''ya kadar tüm yaş gruplarında ön kayıt başvuruları başladı.',
  1,
  now()
WHERE NOT EXISTS (SELECT 1 FROM "hero_slides");
