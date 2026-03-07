#!/bin/sh
# Copy seed DB to persistent volume if it doesn't exist yet
if [ ! -f /data/app.db ]; then
  echo "Initializing database on persistent volume..."
  cp /app/seed.db /data/app.db
fi

# Apply missing columns if needed (idempotent)
sqlite3 /data/app.db "ALTER TABLE TelegramPairing ADD COLUMN telegramUserId TEXT;" 2>/dev/null || true

node server.js
