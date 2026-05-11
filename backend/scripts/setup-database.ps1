# Setup Database Script for PostgreSQL
# This script pushes the Prisma schema and imports backup data

param(
    [string]$DatabaseUrl = $env:DATABASE_URL
)

if (-not $DatabaseUrl) {
    Write-Host "Error: DATABASE_URL environment variable is not set." -ForegroundColor Red
    Write-Host "Please set it in your .env file or pass it as a parameter." -ForegroundColor Yellow
    exit 1
}

Write-Host "=== ChatLogix Database Setup ===" -ForegroundColor Cyan
Write-Host ""

# Change to backend directory
$BackendDir = Join-Path $PSScriptRoot ".."
Set-Location $BackendDir

Write-Host "Step 1: Pushing Prisma schema..." -ForegroundColor Yellow
Write-Host ""

# Try to push the schema
$pushResult = & npx prisma db push --accept-data-loss 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Schema push encountered an error." -ForegroundColor Yellow
    Write-Host $pushResult
    Write-Host ""
    Write-Host "This might be due to permissions. Please ensure your database user has:" -ForegroundColor Yellow
    Write-Host "  - CREATE privilege on the database" -ForegroundColor Yellow
    Write-Host "  - ALL privileges on the public schema" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "You may need to run this as a superuser:" -ForegroundColor Yellow
    Write-Host "  psql -U postgres -c `"GRANT ALL ON SCHEMA public TO your_user;`"" -ForegroundColor Cyan
    Write-Host ""
    $continue = Read-Host "Continue with data import anyway? (y/n)"
    if ($continue -ne "y") {
        exit 1
    }
} else {
    Write-Host "✓ Schema pushed successfully!" -ForegroundColor Green
    Write-Host ""
}

Write-Host "Step 2: Generating Prisma Client..." -ForegroundColor Yellow
& npx prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Failed to generate Prisma client" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "Step 3: Importing backup data..." -ForegroundColor Yellow
Write-Host ""

# Define the order of imports (respecting foreign key constraints)
$importOrder = @(
    "Admin_rows.sql",
    "Vendor_rows.sql", 
    "Customer_rows.sql",
    "Conversation_rows.sql",
    "Message_rows.sql",
    "CreditUsage_rows.sql",
    "WalletTransaction_rows.sql",
    "WhatsAppNumber_rows.sql",
    "Order_rows.sql",
    "CustomerInsights_rows.sql",
    "_prisma_migrations_rows.sql"
)

$backupDir = Join-Path $BackendDir "database_backup"

# Extract connection details from DATABASE_URL
# Format: postgresql://user:password@host:port/database
if ($DatabaseUrl -match "postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)") {
    $dbUser = $matches[1]
    $dbPassword = $matches[2]
    $dbHost = $matches[3]
    $dbPort = $matches[4]
    $dbName = $matches[5]
} else {
    Write-Host "Error: Could not parse DATABASE_URL" -ForegroundColor Red
    exit 1
}

$env:PGPASSWORD = $dbPassword

Write-Host "Connecting to: $dbHost:$dbPort/$dbName as $dbUser" -ForegroundColor Gray
Write-Host ""

$successCount = 0
$failCount = 0

foreach ($file in $importOrder) {
    $filePath = Join-Path $backupDir $file
    if (Test-Path $filePath) {
        Write-Host "Importing $file..." -ForegroundColor Cyan
        
        # Use psql to import the file
        $importCmd = "psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -f `"$filePath`""
        $result = cmd /c $importCmd 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ $file imported successfully" -ForegroundColor Green
            $successCount++
        } else {
            Write-Host "  ✗ Failed to import $file" -ForegroundColor Red
            Write-Host "  Error: $result" -ForegroundColor Red
            $failCount++
        }
    } else {
        Write-Host "  ⚠ File not found: $file" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=== Import Summary ===" -ForegroundColor Cyan
Write-Host "  Success: $successCount files" -ForegroundColor Green
Write-Host "  Failed: $failCount files" -ForegroundColor $(if ($failCount -gt 0) { "Red" } else { "Green" })
Write-Host ""

# Clean up password from environment
Remove-Item Env:\PGPASSWORD

if ($failCount -eq 0) {
    Write-Host "✓ Database setup completed successfully!" -ForegroundColor Green
} else {
    Write-Host "⚠ Some files failed to import. Please check the errors above." -ForegroundColor Yellow
}

