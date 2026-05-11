# Fix Permissions and Setup Database
# This script helps fix PostgreSQL permissions and set up the database

param(
    [string]$PostgresUser = "postgres",
    [string]$DatabaseName = "chatlogix",
    [string]$DatabaseUrl = $env:DATABASE_URL
)

Write-Host "=== Database Setup Helper ===" -ForegroundColor Cyan
Write-Host ""

# Parse DATABASE_URL to get connection details
if ($DatabaseUrl -match "postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)") {
    $dbUser = $matches[1]
    $dbPassword = $matches[2]
    $dbHost = $matches[3]
    $dbPort = $matches[4]
    $dbNameFromUrl = $matches[5]
    
    if ($dbNameFromUrl) {
        $DatabaseName = $dbNameFromUrl
    }
} elseif ($DatabaseUrl -match "postgresql://([^:]+):([^@]+)@([^/]+)/(.+)") {
    $dbUser = $matches[1]
    $dbPassword = $matches[2]
    $dbHost = $matches[3]
    $dbNameFromUrl = $matches[4]
    
    if ($dbNameFromUrl) {
        $DatabaseName = $dbNameFromUrl
    }
    $dbPort = "5432"
}

Write-Host "Step 1: Fixing Permissions..." -ForegroundColor Yellow
Write-Host ""
Write-Host "You need to run this as the postgres superuser." -ForegroundColor Yellow
Write-Host ""
Write-Host "Run this command (you'll be prompted for postgres password):" -ForegroundColor Cyan
Write-Host "  psql -U $PostgresUser -d $DatabaseName -c `"GRANT ALL ON SCHEMA public TO PUBLIC; GRANT CREATE ON SCHEMA public TO PUBLIC;`"" -ForegroundColor White
Write-Host ""
Write-Host "Or use the SQL script:" -ForegroundColor Cyan
Write-Host "  psql -U $PostgresUser -d $DatabaseName -f scripts\grant-permissions-quick.sql" -ForegroundColor White
Write-Host ""

$continue = Read-Host "Have you fixed the permissions? (y/n)"
if ($continue -ne "y") {
    Write-Host "Please fix permissions first, then run this script again." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Step 2: Pushing Prisma Schema..." -ForegroundColor Yellow
$BackendDir = Join-Path $PSScriptRoot ".."
Set-Location $BackendDir

& npx prisma db push --accept-data-loss
if ($LASTEXITCODE -ne 0) {
    Write-Host "Schema push failed. Please check the error above." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 3: Generating Prisma Client..." -ForegroundColor Yellow
& npx prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Failed to generate Prisma client" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Step 4: Importing Backup Data..." -ForegroundColor Yellow
& "$PSScriptRoot\import-backup-data.ps1"

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Green

