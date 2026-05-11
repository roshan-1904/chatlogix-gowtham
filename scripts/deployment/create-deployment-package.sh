#!/bin/bash

# ChatLogix Deployment Package Creator
# This script creates a deployment package with all necessary files for production

set -e

PROJECT_ROOT="${1:-$(pwd)}"
OUTPUT_DIR="${2:-/tmp/chatlogix-deploy}"
CREATE_TAR="${3:-true}"

echo "========================================"
echo "ChatLogix Deployment Package Creator"
echo "========================================"
echo ""

# Check if project root exists
if [ ! -d "$PROJECT_ROOT" ]; then
    echo "❌ Error: Project root not found: $PROJECT_ROOT"
    exit 1
fi

# Create output directory
echo "📁 Creating output directory: $OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"
cd "$OUTPUT_DIR"

# Clean previous deployment
echo "🧹 Cleaning previous deployment files..."
rm -rf backend frontend_v2 ecosystem.config.js

# Verify builds exist
echo "🔍 Verifying builds exist..."

BACKEND_DIST="$PROJECT_ROOT/backend/dist/index.js"
VENDOR_DIST="$PROJECT_ROOT/frontend_v2/apps/web-vendor/dist/index.html"
ADMIN_DIST="$PROJECT_ROOT/frontend_v2/apps/web-admin/dist/index.html"

ERRORS=0

if [ ! -f "$BACKEND_DIST" ]; then
    echo "❌ Backend build not found: $BACKEND_DIST"
    echo "   Run: cd backend && npm run build"
    ERRORS=$((ERRORS + 1))
fi

if [ ! -f "$VENDOR_DIST" ]; then
    echo "❌ Vendor frontend build not found: $VENDOR_DIST"
    echo "   Run: cd frontend_v2 && npm run build"
    ERRORS=$((ERRORS + 1))
fi

if [ ! -f "$ADMIN_DIST" ]; then
    echo "❌ Admin frontend build not found: $ADMIN_DIST"
    echo "   Run: cd frontend_v2 && npm run build"
    ERRORS=$((ERRORS + 1))
fi

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo "❌ Build verification failed. Please build all components first."
    exit 1
fi

echo "✅ All builds verified"
echo ""

# Copy backend files
echo "📦 Copying backend files..."
mkdir -p backend

echo "   → Copying dist/..."
cp -r "$PROJECT_ROOT/backend/dist" backend/

echo "   → Copying package.json..."
cp "$PROJECT_ROOT/backend/package.json" backend/

echo "   → Copying package-lock.json..."
if [ -f "$PROJECT_ROOT/backend/package-lock.json" ]; then
    cp "$PROJECT_ROOT/backend/package-lock.json" backend/
fi

echo "   → Copying prisma/..."
cp -r "$PROJECT_ROOT/backend/prisma" backend/

echo "✅ Backend files copied"
echo ""

# Copy frontend files
echo "📦 Copying frontend files..."
mkdir -p frontend_v2/apps/web-vendor
mkdir -p frontend_v2/apps/web-admin

echo "   → Copying web-vendor/dist/..."
cp -r "$PROJECT_ROOT/frontend_v2/apps/web-vendor/dist" frontend_v2/apps/web-vendor/

echo "   → Copying web-admin/dist/..."
cp -r "$PROJECT_ROOT/frontend_v2/apps/web-admin/dist" frontend_v2/apps/web-admin/

echo "✅ Frontend files copied"
echo ""

# Copy PM2 config
echo "📦 Copying PM2 configuration..."
if [ -f "$PROJECT_ROOT/ecosystem.config.js" ]; then
    cp "$PROJECT_ROOT/ecosystem.config.js" .
    echo "⚠️  Remember to update paths in ecosystem.config.js for your production server!"
    echo "✅ PM2 config copied"
else
    echo "⚠️  Warning: ecosystem.config.js not found"
fi
echo ""

# Calculate sizes
echo "📊 Package size summary:"
BACKEND_SIZE=$(du -sm backend | cut -f1)
FRONTEND_SIZE=$(du -sm frontend_v2 | cut -f1)
TOTAL_SIZE=$((BACKEND_SIZE + FRONTEND_SIZE))

echo "   Backend:  ${BACKEND_SIZE} MB"
echo "   Frontend: ${FRONTEND_SIZE} MB"
echo "   Total:    ${TOTAL_SIZE} MB"
echo ""

# Create tar archive
if [ "$CREATE_TAR" = "true" ]; then
    echo "📦 Creating tar archive..."
    TAR_PATH="$OUTPUT_DIR/chatlogix-production.tar.gz"
    
    # Remove existing tar if present
    rm -f "$TAR_PATH"
    
    tar -czf "$TAR_PATH" backend frontend_v2 ecosystem.config.js 2>/dev/null || tar -czf "$TAR_PATH" backend frontend_v2
    
    TAR_SIZE=$(du -sm "$TAR_PATH" | cut -f1)
    echo "✅ Archive created: $TAR_PATH"
    echo "   Compressed size: ${TAR_SIZE} MB"
    echo ""
fi

# Final summary
echo "========================================"
echo "✅ Deployment package ready!"
echo "========================================"
echo ""
echo "📁 Package location: $OUTPUT_DIR"
echo ""
echo "📋 Next steps:"
echo "   1. Transfer the package to your production server"
echo "   2. Extract on the server"
echo "   3. Create .env file with production values"
echo "   4. Install dependencies: cd backend && npm ci --only=production"
echo "   5. Generate Prisma client: npx prisma generate"
echo "   6. Run migrations: npx prisma migrate deploy"
echo "   7. Update ecosystem.config.js paths"
echo "   8. Start PM2: pm2 start ecosystem.config.js --env production"
echo ""
echo "📖 See docs/deployment/MANUAL_DEPLOYMENT_STEPS.md for detailed instructions"
echo ""

