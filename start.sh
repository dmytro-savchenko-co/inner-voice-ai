#!/bin/sh
# Run Prisma migrations against PostgreSQL (idempotent)
npx prisma migrate deploy 2>/dev/null || echo "Prisma migrate skipped (no pending migrations or not configured)"

node server.js
