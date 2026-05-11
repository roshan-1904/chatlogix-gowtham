# PowerShell script to fix PostgreSQL permissions for apiuser
# Run this script: .\scripts\fix-postgresql-permissions.ps1

Write-Host "🔧 Fixing PostgreSQL Permissions for apiuser" -ForegroundColor Cyan
Write-Host ""

# Check if psql is available
$psqlPath = $null
if (Get-Command psql -ErrorAction SilentlyContinue) {
    $psqlPath = "psql"
    Write-Host "[OK] Found psql in PATH" -ForegroundColor Green
} else {
    # Try common PostgreSQL installation paths
    $commonPaths = @(
        "C:\Program Files\PostgreSQL\15\bin\psql.exe",
        "C:\Program Files\PostgreSQL\14\bin\psql.exe",
        "C:\Program Files\PostgreSQL\13\bin\psql.exe",
        "C:\Program Files (x86)\PostgreSQL\15\bin\psql.exe",
        "C:\Program Files (x86)\PostgreSQL\14\bin\psql.exe"
    )
    
    foreach ($path in $commonPaths) {
        if (Test-Path $path) {
            $psqlPath = $path
            Write-Host "[OK] Found psql at: $path" -ForegroundColor Green
            break
        }
    }
}

if (-not $psqlPath) {
    Write-Host "[ERROR] psql not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install PostgreSQL client tools or add psql to your PATH" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Common installation paths:" -ForegroundColor Yellow
    Write-Host "  - C:\Program Files\PostgreSQL\15\bin\psql.exe" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Or run the SQL commands manually in pgAdmin or psql:" -ForegroundColor Yellow
    Get-Content "$PSScriptRoot\fix-postgresql-permissions.sql" | Write-Host
    exit 1
}

# Get PostgreSQL connection details
Write-Host "Enter PostgreSQL connection details:" -ForegroundColor Yellow
$host = Read-Host "Host (default: localhost)"
if ([string]::IsNullOrWhiteSpace($host)) { $host = "localhost" }

$port = Read-Host "Port (default: 5432)"
if ([string]::IsNullOrWhiteSpace($port)) { $port = "5432" }

$database = Read-Host "Database (default: chatlogix)"
if ([string]::IsNullOrWhiteSpace($database)) { $database = "chatlogix" }

$postgresUser = Read-Host "PostgreSQL superuser (default: postgres)"
if ([string]::IsNullOrWhiteSpace($postgresUser)) { $postgresUser = "postgres" }

$securePassword = Read-Host "PostgreSQL superuser password" -AsSecureString
$password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
)

Write-Host ""
Write-Host "Fixing permissions..." -ForegroundColor Cyan

# Set password as environment variable
$env:PGPASSWORD = $password

try {
    # Read and execute SQL script
    $sqlScript = Get-Content "$PSScriptRoot\fix-postgresql-permissions.sql" -Raw
    
    # Execute SQL
    $result = & $psqlPath -h $host -p $port -U $postgresUser -d $database -c $sqlScript 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "[SUCCESS] Permissions fixed successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "The apiuser now has full access to the chatlogix database." -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "[ERROR] Failed to fix permissions" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
    }
} catch {
    Write-Host ""
    Write-Host "[ERROR] An error occurred:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
} finally {
    # Clean up
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Cyan

