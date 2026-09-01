#!/usr/bin/env bash
# Build a Lambda zip that stays under AWS's 250 MB unzipped limit.
#
# Run from backend/ after: npm ci && npx prisma generate && npm prune --production
#
# Usage: bash scripts/package-lambda.sh /tmp/lambda.zip
#
# Works on a staging copy so this job can never poison an npm cache that
# points at backend/node_modules.
set -euo pipefail

LAMBDA_UNZIPPED_LIMIT=262144000 # 250 MiB — AWS UpdateFunctionCode hard limit

zip_path="${1:?Usage: package-lambda.sh <output-zip-path>}"

if [[ ! -d dist || ! -d node_modules || ! -d prisma || ! -f package.json ]]; then
  echo "ERROR: run this script from backend/ after install, prisma generate, prune, and tsc" >&2
  exit 1
fi

if ! command -v zip >/dev/null || ! command -v unzip >/dev/null; then
  echo "ERROR: zip and unzip are required" >&2
  exit 1
fi

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

echo "=== Staging Lambda payload in $stage ==="
cp -a dist prisma package.json "$stage/"
cp -a node_modules "$stage/node_modules"

cd "$stage"

echo "=== Slimming node_modules for Lambda ==="
before_bytes="$(du -sb node_modules | awk '{print $1}')"
echo "node_modules before: $((before_bytes / 1024 / 1024)) MiB"

# prisma generate writes engine binaries here; npm prune does not remove it.
rm -rf node_modules/.cache

# CLI / migrate tooling is a devDependency but often survives prune as an
# optional peer of @prisma/client. Lambda only needs the generated client.
rm -rf \
  node_modules/prisma \
  node_modules/@prisma/engines \
  node_modules/@prisma/fetch-engine \
  node_modules/@prisma/get-platform

# Keep the Amazon Linux query engine (rhel-openssl-3.0.x). Drop schema-engine
# (migrate-only) and query engines for the CI/dev host (debian/windows/darwin).
find node_modules/.prisma node_modules/@prisma -type f \( \
    -name '*query_engine*' -o \
    -name '*libquery_engine*' -o \
    -name '*libquery-engine*' -o \
    -name 'schema-engine*' \
  \) ! -name '*rhel-openssl-3.0.x*' -delete 2>/dev/null || true
find node_modules/.prisma node_modules/@prisma -type f -name 'schema-engine*' -delete 2>/dev/null || true

# Not imported by any Lambda handler graph (API / auth / catalog import / deploy CLI).
rm -rf \
  node_modules/firebase-admin \
  node_modules/@firebase \
  node_modules/@google-cloud \
  node_modules/google-gax \
  node_modules/@grpc \
  node_modules/@opentelemetry \
  node_modules/exceljs \
  node_modules/date-fns \
  node_modules/@fast-csv \
  node_modules/swagger-ui-express \
  node_modules/swagger-ui-dist \
  node_modules/@aws-sdk/client-iam \
  node_modules/@aws-sdk/client-lambda \
  node_modules/image-size \
  node_modules/pino-rotating-file-stream \
  node_modules/jsonwebtoken \
  node_modules/express \
  node_modules/cors \
  node_modules/helmet \
  node_modules/morgan \
  node_modules/express-rate-limit \
  node_modules/rate-limit-redis

# Docs, maps, and TypeScript types are unused at runtime.
find node_modules -type f \( \
    -name '*.md' -o \
    -name '*.markdown' -o \
    -name '*.map' -o \
    -name '*.d.ts' -o \
    -name 'LICENSE*' -o \
    -name 'CHANGELOG*' \
  \) -delete 2>/dev/null || true
find node_modules -type d \( -name docs -o -name example -o -name examples \) -print0 \
  | xargs -0 -r rm -rf 2>/dev/null || true

# Compiled tests are never loaded as Lambda handlers.
find dist -type d -name '__tests__' -print0 | xargs -0 -r rm -rf 2>/dev/null || true

after_bytes="$(du -sb node_modules | awk '{print $1}')"
echo "node_modules after:  $((after_bytes / 1024 / 1024)) MiB"

echo "=== Creating $zip_path ==="
rm -f "$zip_path"
zip -rq "$zip_path" dist node_modules prisma package.json

zipped_bytes="$(stat -c%s "$zip_path")"
unzipped_bytes="$(unzip -l "$zip_path" | tail -n1 | awk '{print $1}')"

echo "Zipped:   $((zipped_bytes / 1024 / 1024)) MiB ($zipped_bytes bytes)"
echo "Unzipped: $((unzipped_bytes / 1024 / 1024)) MiB ($unzipped_bytes bytes)"
echo "AWS limit: $((LAMBDA_UNZIPPED_LIMIT / 1024 / 1024)) MiB"

if ! [[ "$unzipped_bytes" =~ ^[0-9]+$ ]]; then
  echo "ERROR: could not parse unzipped size from unzip -l" >&2
  exit 1
fi

if (( unzipped_bytes >= LAMBDA_UNZIPPED_LIMIT )); then
  echo "ERROR: unzipped Lambda package is $unzipped_bytes bytes; AWS rejects anything >= $LAMBDA_UNZIPPED_LIMIT" >&2
  echo "Largest remaining packages:" >&2
  du -sm node_modules/* node_modules/.[^.]* 2>/dev/null | sort -nr | head -n 20 >&2
  exit 1
fi

echo "=== Lambda package OK ==="
