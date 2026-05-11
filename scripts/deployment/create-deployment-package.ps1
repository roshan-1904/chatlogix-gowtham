# ChatLogix Deployment Package Creator
# This script creates a deployment package with all necessary files for production

param(
    [string]$ProjectRoot = "C:\Projects\ChatLogix",
    [string]$OutputDir = "C:\temp\chatlogix-deploy",
    [switch]$CreateZip = $true
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "ChatLogix Deployment Package Creator" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if project root exists
if (-not (Test-Path $ProjectRoot)) {
    Write-Host "❌ Error: Project root not found: $ProjectRoot" -ForegroundColor Red
    exit 1
}

# Create output directory
Write-Host "📁 Creating output directory: $OutputDir" -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
cd $OutputDir

# Clean previous deployment
Write-Host "🧹 Cleaning previous deployment files..." -ForegroundColor Yellow
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue backend, frontend_v2, ecosystem.config.js

# Verify builds exist
Write-Host "🔍 Verifying builds exist..." -ForegroundColor Yellow

$backendDist = Join-Path $ProjectRoot "backend\dist\index.js"
$vendorDist = Join-Path $ProjectRoot "frontend_v2\apps\web-vendor\dist\index.html"
$adminDist = Join-Path $ProjectRoot "frontend_v2\apps\web-admin\dist\index.html"

$errors = @()

if (-not (Test-Path $backendDist)) {
    $errors += "Backend build not found: $backendDist`n   Run: cd backend && npm run build"
}

if (-not (Test-Path $vendorDist)) {
    $errors += "Vendor frontend build not found: $vendorDist`n   Run: cd frontend_v2 && npm run build"
}

if (-not (Test-Path $adminDist)) {
    $errors += "Admin frontend build not found: $adminDist`n   Run: cd frontend_v2 && npm run build"
}

if ($errors.Count -gt 0) {
    Write-Host "❌ Build verification failed:" -ForegroundColor Red
    foreach ($error in $errors) {
        Write-Host "   $error" -ForegroundColor Red
    }
    exit 1
}

Write-Host "✅ All builds verified" -ForegroundColor Green
Write-Host ""

# Copy backend files
Write-Host "📦 Copying backend files..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "backend" | Out-Null

Write-Host "   → Copying dist/..." -ForegroundColor Gray
Copy-Item -Recurse "$ProjectRoot\backend\dist" "backend\dist"

Write-Host "   → Copying package.json..." -ForegroundColor Gray
Copy-Item "$ProjectRoot\backend\package.json" "backend\"

Write-Host "   → Copying package-lock.json..." -ForegroundColor Gray
if (Test-Path "$ProjectRoot\backend\package-lock.json") {
    Copy-Item "$ProjectRoot\backend\package-lock.json" "backend\"
}

Write-Host "   → Copying prisma/..." -ForegroundColor Gray
Copy-Item -Recurse "$ProjectRoot\backend\prisma" "backend\prisma"

Write-Host "✅ Backend files copied" -ForegroundColor Green
Write-Host ""

# Copy frontend files
Write-Host "📦 Copying frontend files..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "frontend_v2\apps\web-vendor" | Out-Null
New-Item -ItemType Directory -Force -Path "frontend_v2\apps\web-admin" | Out-Null

Write-Host "   → Copying web-vendor/dist/..." -ForegroundColor Gray
Copy-Item -Recurse "$ProjectRoot\frontend_v2\apps\web-vendor\dist" "frontend_v2\apps\web-vendor\dist"

Write-Host "   → Copying web-admin/dist/..." -ForegroundColor Gray
Copy-Item -Recurse "$ProjectRoot\frontend_v2\apps\web-admin\dist" "frontend_v2\apps\web-admin\dist"

Write-Host "✅ Frontend files copied" -ForegroundColor Green
Write-Host ""

# Copy PM2 config
Write-Host "📦 Copying PM2 configuration..." -ForegroundColor Yellow
if (Test-Path "$ProjectRoot\ecosystem.config.js") {
    Copy-Item "$ProjectRoot\ecosystem.config.js" "."
    Write-Host "⚠️  Remember to update paths in ecosystem.config.js for your production server!" -ForegroundColor Yellow
    Write-Host "✅ PM2 config copied" -ForegroundColor Green
} else {
    Write-Host "⚠️  Warning: ecosystem.config.js not found" -ForegroundColor Yellow
}
Write-Host ""

# Calculate sizes
Write-Host "📊 Package size summary:" -ForegroundColor Yellow
$backendSize = (Get-ChildItem -Recurse "backend" | Measure-Object -Property Length -Sum).Sum / 1MB
$frontendSize = (Get-ChildItem -Recurse "frontend_v2" | Measure-Object -Property Length -Sum).Sum / 1MB
$totalSize = $backendSize + $frontendSize

Write-Host "   Backend:  $([math]::Round($backendSize, 2)) MB" -ForegroundColor Gray
Write-Host "   Frontend: $([math]::Round($frontendSize, 2)) MB" -ForegroundColor Gray
Write-Host "   Total:    $([math]::Round($totalSize, 2)) MB" -ForegroundColor Cyan
Write-Host ""

# Create zip archive
if ($CreateZip) {
    Write-Host "📦 Creating zip archive..." -ForegroundColor Yellow
    $zipPath = Join-Path (Get-Location).Path "chatlogix-production.zip"
    
    # Remove existing zip if present
    if (Test-Path $zipPath) {
        Remove-Item $zipPath -Force
    }
    
    Compress-Archive -Path backend, frontend_v2, ecosystem.config.js -DestinationPath $zipPath -Force
    
    $zipSize = (Get-Item $zipPath).Length / 1MB
    Write-Host "✅ Archive created: $zipPath" -ForegroundColor Green
    Write-Host "   Compressed size: $([math]::Round($zipSize, 2)) MB" -ForegroundColor Gray
    Write-Host ""
}

# Final summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ Deployment package ready!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📁 Package location: $OutputDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Yellow
Write-Host "   1. Transfer the package to your production server" -ForegroundColor White
Write-Host "   2. Extract on the server" -ForegroundColor White
Write-Host "   3. Create .env file with production values" -ForegroundColor White
Write-Host "   4. Install dependencies: cd backend && npm ci --only=production" -ForegroundColor White
Write-Host "   5. Generate Prisma client: npx prisma generate" -ForegroundColor White
Write-Host "   6. Run migrations: npx prisma migrate deploy" -ForegroundColor White
Write-Host "   7. Update ecosystem.config.js paths" -ForegroundColor White
Write-Host "   8. Start PM2: pm2 start ecosystem.config.js --env production" -ForegroundColor White
Write-Host ""
Write-Host "📖 See docs/deployment/MANUAL_DEPLOYMENT_STEPS.md for detailed instructions" -ForegroundColor Gray
Write-Host ""

