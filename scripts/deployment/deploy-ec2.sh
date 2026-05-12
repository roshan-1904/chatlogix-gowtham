#!/usr/bin/env bash
set -euo pipefail

cd /home/bitnami/chatlogix

git fetch origin
git reset --hard origin/master

rm -rf backend/dist frontend/dist
mkdir -p frontend

tar -xzf /tmp/chatlogix-dist.tar.gz -C .
rm -f /tmp/chatlogix-dist.tar.gz

cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
cd ..

pm2 reload ecosystem.config.js --env production
pm2 save
