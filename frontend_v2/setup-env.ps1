# Setup Environment Variables
# This script copies env.template files to .env.local files

Write-Host "Setting up environment variables..." -ForegroundColor Green

# Vendor Web App
if (Test-Path "apps\web-vendor\env.template") {
    if (-not (Test-Path "apps\web-vendor\.env.local")) {
        Copy-Item "apps\web-vendor\env.template" "apps\web-vendor\.env.local"
        Write-Host "Created apps\web-vendor\.env.local" -ForegroundColor Green
    } else {
        Write-Host "apps\web-vendor\.env.local already exists, skipping..." -ForegroundColor Yellow
    }
}

# Admin Web App
if (Test-Path "apps\web-admin\env.template") {
    if (-not (Test-Path "apps\web-admin\.env.local")) {
        Copy-Item "apps\web-admin\env.template" "apps\web-admin\.env.local"
        Write-Host "Created apps\web-admin\.env.local" -ForegroundColor Green
    } else {
        Write-Host "apps\web-admin\.env.local already exists, skipping..." -ForegroundColor Yellow
    }
}

# Mobile App
if (Test-Path "apps\vendor-mobile\env.template") {
    if (-not (Test-Path "apps\vendor-mobile\.env")) {
        Copy-Item "apps\vendor-mobile\env.template" "apps\vendor-mobile\.env"
        Write-Host "Created apps\vendor-mobile\.env" -ForegroundColor Green
    } else {
        Write-Host "apps\vendor-mobile\.env already exists, skipping..." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Environment setup complete!" -ForegroundColor Green
Write-Host "Please review and update the .env.local files with your actual values." -ForegroundColor Cyan
