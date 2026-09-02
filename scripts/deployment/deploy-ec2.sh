#!/usr/bin/env bash
set -euo pipefail

cd /home/bitnami/chatlogix

echo "=== git fetch + reset ==="
git fetch origin
git reset --hard origin/master

rm -rf backend/dist frontend/dist
mkdir -p frontend

echo "=== extracting dist tarball ==="
tar -xzf /tmp/chatlogix-dist.tar.gz -C .
rm -f /tmp/chatlogix-dist.tar.gz

cd backend
echo "=== npm ci (production only -- this box runs prebuilt dist/, never needs the dev toolchain) ==="
npm ci --omit=dev
echo "=== prisma generate ==="
npx prisma generate
echo "=== prisma migrate deploy ==="
npx prisma migrate deploy
cd ..

echo "=== pm2 reload ==="
pm2 reload ecosystem.config.js --env production
pm2 save
echo "=== deploy-ec2.sh done ==="
