#!/bin/bash
# Complete Database Setup for Bitnami
# This script fixes permissions, pushes schema, and imports data

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

cd "$BACKEND_DIR"

echo "=== ChatLogix Database Setup for Bitnami ==="
echo ""

# Step 1: Fix Permissions
echo "Step 1: Fixing PostgreSQL Permissions..."
echo ""

# Try to fix permissions using the helper script
if [ -f "$SCRIPT_DIR/fix-permissions-bitnami.sh" ]; then
    bash "$SCRIPT_DIR/fix-permissions-bitnami.sh"
else
    echo "⚠ Permissions fix script not found. Please fix permissions manually first."
    echo ""
    echo "Try one of these methods:"
    echo "  1. sudo -u postgres psql -d chatlogix -c \"GRANT ALL ON SCHEMA public TO PUBLIC;\""
    echo "  2. psql \$DATABASE_URL -c \"GRANT ALL ON SCHEMA public TO PUBLIC;\""
    echo ""
    read -p "Press Enter to continue after fixing permissions..."
fi

echo ""
echo "Step 2: Pushing Prisma Schema..."
echo ""

npx prisma db push --accept-data-loss

if [ $? -ne 0 ]; then
    echo "✗ Schema push failed. Please check the error above."
    exit 1
fi

echo ""
echo "✓ Schema pushed successfully!"
echo ""

echo "Step 3: Generating Prisma Client..."
npx prisma generate

if [ $? -ne 0 ]; then
    echo "⚠ Failed to generate Prisma client"
fi

echo ""
echo "Step 4: Importing Backup Data..."
echo ""

if [ -f "$SCRIPT_DIR/import-backup-data.sh" ]; then
    bash "$SCRIPT_DIR/import-backup-data.sh"
else
    echo "⚠ Import script not found. Please import data manually."
fi

echo ""
echo "=== Setup Complete ==="

