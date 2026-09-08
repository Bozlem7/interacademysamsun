# Inter Academy — Full-Stack Platform

Statik prototipten (`Inter Academy.dc.html`) taşınan üretime hazır full-stack uygulama.

## Yapı

- `backend/` — Node.js + Express + Prisma (PostgreSQL), katmanlı mimari (controller/service/repository)
- `frontend/` — React + Vite + Tailwind CSS

## Kurulum

### 1. PostgreSQL

Yerelde bir PostgreSQL örneği çalıştırın ve `inter_academy` adında bir veritabanı oluşturun.

### 2. Backend

```bash
cd backend
cp .env.example .env      # DATABASE_URL, JWT_SECRET, TC_ENCRYPTION_KEY değerlerini doldurun
npm install
npm run prisma:migrate    # şemayı oluşturur
npm run seed               # admin1/admin2/admin3 + fee_settings seed eder
```

Migration sonrası **bir kere** `prisma/triggers.sql` dosyasını veritabanınıza uygulayın (ödeme statü kilidi trigger'ı + trigram index):

```bash
psql "$DATABASE_URL" -f prisma/triggers.sql
```

Ardından API'yi başlatın:

```bash
npm run dev   # http://localhost:4000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173 (proxy ile backend'e bağlanır)
```

## Seed admin hesapları

| Kullanıcı adı | Şifre |
|---|---|
| admin1 | inter_pass_10 |
| admin2 | inter_pass_20 |
| admin3 | inter_pass_30 |

Şifreler `.env` içindeki `SEED_ADMIN*_PASSWORD` değerlerinden argon2 ile hash'lenerek seed edilir; DB'de asla düz metin tutulmaz.

## Cron işleri

`backend/src/modules/payments/payments.scheduler.ts` sunucu ayağa kalktığında iki job kaydeder:
- Her ayın 1'i 00:05 — o ayın ödeme (payments) satırlarını üretir.
- Her gün 09:00 — 16'sında (15 vadeli) ve ayın 1'inde (bir önceki ayın 30 vadeli) ödenmemiş kayıtlara WhatsApp gecikme bildirimi gönderir.

`WHATSAPP_API_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` boşsa bildirimler sadece konsola loglanır (stub mod).
