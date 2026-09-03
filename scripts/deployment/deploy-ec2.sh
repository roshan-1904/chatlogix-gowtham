#!/usr/bin/env bash
set -euo pipefail

cd /home/bitnami/chatlogix

DEPLOY_SHA="${DEPLOY_SHA:-origin/master}"

echo "=== git fetch + reset to ${DEPLOY_SHA} ==="
git fetch origin
git reset --hard "${DEPLOY_SHA}"

rm -rf backend/dist backend/node_modules frontend/dist
mkdir -p frontend backend

echo "=== extracting dist tarball ==="
tar -xzf /tmp/chatlogix-dist.tar.gz -C .
rm -f /tmp/chatlogix-dist.tar.gz

cd backend
if [ -f node_modules.tar.gz ]; then
  echo "=== extracting prebuilt production node_modules (skip npm ci) ==="
  tar -xzf node_modules.tar.gz
  rm -f node_modules.tar.gz
elif [ ! -d node_modules ]; then
  echo "=== fallback npm ci (production only -- tarball had no node_modules) ==="
  npm ci --omit=dev
  echo "=== prisma generate ==="
  npx prisma generate
else
  echo "=== using node_modules from tarball ==="
fi

if [ ! -d node_modules/.prisma ]; then
  echo "=== prisma generate (client missing from packed modules) ==="
  npx prisma generate
fi

echo "=== prisma migrate deploy ==="
npx prisma migrate deploy
cd ..

echo "=== pm2 reload ==="
pm2 reload ecosystem.config.js --env production
pm2 save
echo "=== deploy-ec2.sh done ==="
