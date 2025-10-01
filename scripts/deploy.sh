#!/usr/bin/env bash
set -euo pipefail

# Usage: bash scripts/deploy.sh

if ! command -v pm2 >/dev/null 2>&1; then
  echo "Installing pm2 globally..."
  npm i -g pm2
fi

npm install
npm run prisma:generate
npm run migrate:deploy
npm run build

pm2 delete plazma-bot 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save

echo "Deployment complete. Check logs: pm2 logs plazma-bot --lines 200"
