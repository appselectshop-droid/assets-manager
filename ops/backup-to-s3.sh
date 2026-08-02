#!/bin/bash
# Respaldo diario del Mongo self-hosted -> S3. Pensado para correr por cron
# como root en el EC2 (ver crontab: 0 12 * * *).
set -euo pipefail

APP_DIR=/home/ubuntu/assets-manager
BACKUP_DIR=/home/ubuntu/mongo-backups
BUCKET=eup-assets-manager-backups
KEEP_LOCAL_DAYS=7
DATE=$(date +%F_%H%M)
LOG="$BACKUP_DIR/backup.log"

mkdir -p "$BACKUP_DIR"
cd "$APP_DIR"
set -a
source .env
set +a

ARCHIVE="$BACKUP_DIR/assets-manager-$DATE.archive.gz"

{
  echo "[$DATE] iniciando backup"

  docker compose exec -T mongo mongodump \
    --username "$MONGO_ROOT_USER" --password "$MONGO_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --db assets-manager \
    --archive --gzip > "$ARCHIVE"

  aws s3 cp "$ARCHIVE" "s3://$BUCKET/mongo/$(basename "$ARCHIVE")" --region us-east-1

  echo "[$DATE] backup subido: $(basename "$ARCHIVE") ($(du -h "$ARCHIVE" | cut -f1))"

  find "$BACKUP_DIR" -name "assets-manager-*.archive.gz" -mtime +"$KEEP_LOCAL_DAYS" -delete

  echo "[$DATE] OK"
} >> "$LOG" 2>&1
