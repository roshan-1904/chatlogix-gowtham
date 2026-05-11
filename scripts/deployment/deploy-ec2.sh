#!/usr/bin/env bash
set -euo pipefail

cd /home/bitnami/chatlogix

git fetch origin
git reset --hard origin/master

cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build

cd ../frontend_v2
npm ci
npm run build

cd ..
pm2 reload ecosystem.config.js --env production
pm2 save
