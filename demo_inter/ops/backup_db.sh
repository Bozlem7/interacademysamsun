#!/usr/bin/env bash
# Inter Academy — günlük PostgreSQL yedeği.
#
# Sunucuya kurulum: /var/scripts/backup_db.sh olarak kopyalanır ve cron ile her gece çalıştırılır
# (bkz. demo_inter/ops/README.md). Çıktı stdout'a yazılır; cron satırı bunu /var/log/db_backup.log'a ekler.
#
# Bağlantı bilgileri backend .env dosyasındaki DATABASE_URL'den okunur. .env `source` edilmez —
# dosyadaki her satır kabuk kodu olarak çalışırdı; yalnızca DATABASE_URL satırı ayrıştırılır ve
# şifre komut satırında (ps çıktısında) görünmesin diye PG* ortam değişkenleriyle pg_dump'a verilir.

set -Eeuo pipefail
umask 077

ENV_FILE="${ENV_FILE:-/var/www/inter_academy/demo_inter/backend/.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
LOCK_FILE="${LOCK_FILE:-/var/lock/backup_db.lock}"

log() { printf '[%s] %s\n' "$(TZ=Europe/Istanbul date '+%Y-%m-%d %H:%M:%S')" "$*"; }
fail() {
  log "HATA: $*"
  exit 1
}
trap 'log "HATA: beklenmeyen hata (satır $LINENO, çıkış kodu $?)"' ERR

for cmd in pg_dump gzip flock; do
  command -v "$cmd" >/dev/null || fail "Gerekli komut bulunamadı: $cmd"
done

# Aynı anda iki yedekleme çalışmasın (ör. elle tetiklenen çalıştırma cron'la çakışırsa).
exec 9>"$LOCK_FILE"
flock -n 9 || fail "Başka bir yedekleme zaten çalışıyor"

# --- Bağlantı bilgileri ------------------------------------------------------------------------

[[ -r "$ENV_FILE" ]] || fail ".env dosyası okunamadı: $ENV_FILE"

DATABASE_URL="$(grep -E '^[[:space:]]*DATABASE_URL=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- | tr -d '\r')"
DATABASE_URL="${DATABASE_URL#\"}" && DATABASE_URL="${DATABASE_URL%\"}"
DATABASE_URL="${DATABASE_URL#\'}" && DATABASE_URL="${DATABASE_URL%\'}"
[[ "$DATABASE_URL" =~ ^postgres(ql)?://.+@.+/.+ ]] || fail "DATABASE_URL bulunamadı veya beklenen biçimde değil"

# Şifredeki özel karakterler URL'de %XX olarak kodlanır (ör. @ -> %40); pg_dump çözülmüş halini ister.
urldecode() { printf '%b' "${1//%/\\x}"; }

rest="${DATABASE_URL#*://}"
userinfo="${rest%@*}" # son '@'a kadar — şifrede kodlanmamış '@' olsa bile doğru bölünür
hostpart="${rest##*@}"
hostport="${hostpart%%/*}"
dbpath="${hostpart#*/}"

PGUSER="$(urldecode "${userinfo%%:*}")"
PGPASSWORD=""
[[ "$userinfo" == *:* ]] && PGPASSWORD="$(urldecode "${userinfo#*:}")"
PGHOST="${hostport%%:*}"
PGPORT=5432
[[ "$hostport" == *:* ]] && PGPORT="${hostport##*:}"
PGDATABASE="$(urldecode "${dbpath%%\?*}")" # ?schema=public gibi Prisma'ya özel parametreler atılır
export PGUSER PGPASSWORD PGHOST PGPORT PGDATABASE

[[ -n "$PGDATABASE" && -n "$PGUSER" ]] || fail "DATABASE_URL'den veritabanı/kullanıcı adı çıkarılamadı"

# --- Yedekleme ---------------------------------------------------------------------------------

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

timestamp="$(TZ=Europe/Istanbul date '+%Y-%m-%d_%H%M%S')"
final="$BACKUP_DIR/db_backup_${timestamp}.sql.gz"
# Önce geçici dosyaya yazılır, ancak tüm kontrollerden geçince asıl adına taşınır — yarım kalmış
# bir dump hiçbir zaman geçerli bir yedek gibi görünmez.
tmp="$final.partial"
trap 'rm -f "$tmp"' EXIT

log "Yedekleme başladı: $PGDATABASE ($PGHOST:$PGPORT)"
started=$SECONDS

pg_dump --no-password --format=plain | gzip -c >"$tmp" || fail "pg_dump başarısız oldu"

gzip -t "$tmp" || fail "Arşiv bütünlük kontrolü başarısız"
# pg_dump yalnızca başarıyla bittiğinde dosyanın sonuna bu satırı yazar.
dump_tail="$(gzip -dc "$tmp" | tail -n 5)"
[[ "$dump_tail" == *"PostgreSQL database dump complete"* ]] || fail "Dump eksik görünüyor (bitiş satırı yok)"

chmod 600 "$tmp"
mv "$tmp" "$final"
log "Yedekleme tamamlandı: $final ($(du -h "$final" | cut -f1), $((SECONDS - started)) sn)"

# --- Temizlik ----------------------------------------------------------------------------------

# Bu noktaya yalnızca başarılı bir yedekten sonra gelinir: yedekler günlerce üst üste başarısız
# olsa bile, eski sağlam yedekler yerine yenisi alınmadan silinmez.
deleted="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'db_backup_*.sql.gz' -mtime +"$RETENTION_DAYS" -print -delete | wc -l)"
# Süreç öldürülürse (kill -9, sunucu kapanması) EXIT trap'i çalışmaz; kalan .partial dosyaları da temizlenir.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'db_backup_*.sql.gz.partial' -mmin +1440 -delete

remaining="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'db_backup_*.sql.gz' | wc -l)"
log "Temizlik: ${RETENTION_DAYS} günden eski ${deleted} yedek silindi; mevcut yedek sayısı: ${remaining}"
log "Disk: $(df -h "$BACKUP_DIR" | awk 'NR==2 {print $4 " boş (" $5 " dolu)"}')"
