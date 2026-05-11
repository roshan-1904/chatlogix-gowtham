# Script to regenerate Prisma client
# Run this after stopping the server

Write-Host "Regenerating Prisma client..." -ForegroundColor Yellow

# Navigate to backend directory
Set-Location $PSScriptRoot\..

# Generate Prisma client
npx prisma generate

Write-Host "Prisma client regenerated successfully!" -ForegroundColor Green
Write-Host "Please restart your server for changes to take effect." -ForegroundColor Cyan

