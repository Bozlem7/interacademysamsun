# Veritabanı yedekleme

`backup_db.sh` — backend `.env` dosyasındaki `DATABASE_URL` ile `pg_dump` alır, `/var/backups/postgres/db_backup_YYYY-MM-DD_HHMMSS.sql.gz` olarak sıkıştırır, bütünlüğünü doğrular ve 30 günden eski yedekleri siler. Temizlik yalnızca o geceki yedek başarılı olursa çalışır.

## Kurulum (sunucuda, root)

```bash
cd /var/www/inter_academy && git pull
mkdir -p /var/scripts
install -m 700 demo_inter/ops/backup_db.sh /var/scripts/backup_db.sh

# Elle bir kez çalıştırıp sonucu kontrol et
bash /var/scripts/backup_db.sh
ls -lh /var/backups/postgres

# Cron: her gece 02:00 (Türkiye). Sunucu saati UTC olduğu için 23:00 UTC yazılır —
# Türkiye 2016'dan beri yaz saati uygulamıyor, fark her zaman +3.
(crontab -l 2>/dev/null | grep -v backup_db.sh; echo "0 23 * * * /bin/bash /var/scripts/backup_db.sh >> /var/log/db_backup.log 2>&1") | crontab -
crontab -l
```

Betik güncellendiğinde `install` satırını tekrar çalıştırmak yeterli.

## Kontrol

```bash
tail -n 20 /var/log/db_backup.log
ls -lh /var/backups/postgres
```

## Geri yükleme

Önce **ayrı bir test veritabanına** açıp kontrol et; canlı veritabanının üzerine doğrudan yazma.

```bash
sudo -u postgres createdb restore_test
gunzip -c /var/backups/postgres/db_backup_<TARİH>.sql.gz | sudo -u postgres psql -q restore_test
sudo -u postgres psql restore_test -c "select count(*) from students;"
sudo -u postgres dropdb restore_test
```

## Sınırlar

- Günlük yedek, en kötü durumda son yedekten bu yana geçen ~24 saatlik veriyi kaybettirir.
- Yedekler aynı sunucuda durur; sunucu/disk kaybolursa yedekler de gider. Düzenli olarak sunucu dışına kopyalanmalı (ör. `scp root@SUNUCU:/var/backups/postgres/*.sql.gz .`).
- Yalnızca veritabanını kapsar; yüklenen dosyalar (`backend/uploads/`, kayıt PDF'leri `backend/storage/`) ve WhatsApp oturumu (`backend/tokens/`) bu yedekte yoktur.
