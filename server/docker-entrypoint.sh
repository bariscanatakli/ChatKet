#!/bin/sh
set -e

echo "🔄 Pushing Prisma schema to database..."
npx prisma db push --accept-data-loss

echo "🚀 Starting server..."
exec node dist/main.js
