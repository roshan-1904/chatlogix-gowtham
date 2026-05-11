#!/bin/bash
# Complete Database Setup Script
# Creates tables first, then imports data

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

cd "$BACKEND_DIR"

echo "========================================="
echo "  ChatLogix Database Complete Setup"
echo "========================================="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL environment variable is not set"
    echo ""
    echo "Please set it in your .env file or export it:"
    echo "  export DATABASE_URL='postgresql://user:password@host:port/database'"
    exit 1
fi

echo "Step 1/4: Checking database connection..."
echo ""

# Test connection
if npx prisma db execute --stdin <<< "SELECT 1;" > /dev/null 2>&1; then
    echo "✓ Database connection OK"
else
    echo "⚠️  Could not verify connection, continuing anyway..."
fi

echo ""
echo "Step 2/4: Pushing Prisma Schema (Creating Tables)..."
echo ""

# Push schema to create tables
npx prisma db push --accept-data-loss

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Failed to push schema!"
    echo ""
    echo "Common issues:"
    echo "  1. Permission denied → Fix permissions first"
    echo "  2. Connection error → Check DATABASE_URL"
    echo ""
    exit 1
fi

echo ""
echo "✓ Schema pushed successfully! Tables created."
echo ""

echo "Step 3/4: Generating Prisma Client..."
npx prisma generate

if [ $? -ne 0 ]; then
    echo "⚠️  Failed to generate Prisma client (non-critical)"
fi

echo ""
echo "Step 4/4: Importing Backup Data..."
echo ""

# Import data
if [ -f "$SCRIPT_DIR/import-backup-data.sh" ]; then
    bash "$SCRIPT_DIR/import-backup-data.sh"
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "========================================="
        echo "  ✅ Setup Complete!"
        echo "========================================="
        echo ""
        echo "Your database is now ready with:"
        echo "  ✓ All tables created"
        echo "  ✓ All data imported"
        echo ""
        exit 0
    else
        echo ""
        echo "⚠️  Some data import errors occurred"
        exit 1
    fi
else
    echo "❌ Import script not found: $SCRIPT_DIR/import-backup-data.sh"
    echo ""
    echo "Please import data manually using the backup files."
    exit 1
fi

