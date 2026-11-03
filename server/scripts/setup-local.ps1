$ErrorActionPreference = 'Stop'

function Read-RequiredValue([string]$Prompt) {
    while ($true) {
        $value = Read-Host $Prompt
        if (-not [string]::IsNullOrWhiteSpace($value)) { return $value.Trim() }
        Write-Host 'A value is required.' -ForegroundColor Yellow
    }
}

function Read-SecretValue([string]$Prompt, [int]$MinimumLength = 12) {
    while ($true) {
        $secure = Read-Host $Prompt -AsSecureString
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try {
            $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
        } finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
        }
        if ($value.Length -ge $MinimumLength) { return $value }
        Write-Host "Use at least $MinimumLength characters." -ForegroundColor Yellow
    }
}

function Escape-DotEnv([string]$Value) {
    if ($Value.Contains('\') -or $Value.Contains('"') -or $Value.Contains("`r") -or $Value.Contains("`n")) {
        throw 'For this setup script, .env values cannot contain backslashes, double quotes, or line breaks. Use another password/value and rerun.'
    }
    return '"' + $Value + '"'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $repoRoot

Write-Host "`n=== ExamPortal local setup ===" -ForegroundColor Cyan

$node = Get-Command node -ErrorAction SilentlyContinue
$npm = Get-Command npm -ErrorAction SilentlyContinue
$psql = Get-Command psql -ErrorAction SilentlyContinue
$createdb = Get-Command createdb -ErrorAction SilentlyContinue

if (-not $node -or -not $npm) {
    throw 'Node.js and npm are required. Install the current Node.js LTS release, reopen PowerShell, and rerun this script.'
}
if (-not $psql -or -not $createdb) {
    throw 'PostgreSQL command-line tools (psql and createdb) are not on PATH. Add the PostgreSQL bin folder (usually C:\Program Files\PostgreSQL\<version>\bin) to PATH, reopen PowerShell, and rerun.'
}

Write-Host "Node: $(& node --version) | npm: $(& npm --version)"

$envPath = Join-Path $repoRoot 'server/.env'
if (Test-Path $envPath) {
    $backup = "$envPath.backup-$(Get-Date -Format yyyyMMdd-HHmmss)"
    Copy-Item $envPath $backup
    Write-Host "Existing server/.env backed up to $backup" -ForegroundColor Yellow
}

$dbHost = Read-Host 'PostgreSQL host [localhost]'
if ([string]::IsNullOrWhiteSpace($dbHost)) { $dbHost = 'localhost' }
$dbPortText = Read-Host 'PostgreSQL port [5432]'
if ([string]::IsNullOrWhiteSpace($dbPortText)) { $dbPortText = '5432' }
$dbPort = 0
if (-not [int]::TryParse($dbPortText, [ref]$dbPort) -or $dbPort -lt 1 -or $dbPort -gt 65535) {
    throw 'Invalid PostgreSQL port.'
}
$dbName = Read-Host 'Database name [exam_portal_db]'
if ([string]::IsNullOrWhiteSpace($dbName)) { $dbName = 'exam_portal_db' }
$dbUser = Read-Host 'PostgreSQL user [postgres]'
if ([string]::IsNullOrWhiteSpace($dbUser)) { $dbUser = 'postgres' }
$dbPassword = Read-SecretValue 'PostgreSQL password (input hidden)' 1

$teacherName = Read-RequiredValue 'Teacher full name'
$teacherEmail = Read-RequiredValue 'Teacher email'
$teacherPassword = Read-SecretValue 'Teacher login password (minimum 12 characters; input hidden)'
$studentName = Read-RequiredValue 'Student full name'
$studentEmail = Read-RequiredValue 'Student email'
$studentId = Read-RequiredValue 'Student ID (e.g. ST-00001)'
$studentPassword = Read-SecretValue 'Student login password (minimum 12 characters; input hidden)'

$bytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$jwtSecret = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()

$envContent = @"
PORT=5000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5000
DATABASE_URL=
DB_HOST=$dbHost
DB_PORT=$dbPort
DB_NAME=$dbName
DB_USER=$dbUser
DB_PASSWORD=$(Escape-DotEnv $dbPassword)
JWT_SECRET=$jwtSecret
JWT_EXPIRES_IN=24h
DB_POOL_MAX=20
DB_IDLE_TIMEOUT_MS=30000
DB_CONNECTION_TIMEOUT_MS=3000
SEED_TEACHER_NAME=$(Escape-DotEnv $teacherName)
SEED_TEACHER_EMAIL=$(Escape-DotEnv $teacherEmail)
SEED_TEACHER_PASSWORD=$(Escape-DotEnv $teacherPassword)
SEED_STUDENT_NAME=$(Escape-DotEnv $studentName)
SEED_STUDENT_EMAIL=$(Escape-DotEnv $studentEmail)
SEED_STUDENT_ID=$(Escape-DotEnv $studentId)
SEED_STUDENT_PASSWORD=$(Escape-DotEnv $studentPassword)
"@
[System.IO.File]::WriteAllText($envPath, $envContent, (New-Object System.Text.UTF8Encoding($false)))
Write-Host 'Created server/.env (credentials are not printed).' -ForegroundColor Green

try {
    $env:PGPASSWORD = $dbPassword
    $databaseExists = & psql -h $dbHost -p $dbPort -U $dbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$($dbName.Replace("'", "''"))';"
    if ($LASTEXITCODE -ne 0) { throw 'Could not connect to PostgreSQL. Check that the service is running and the host, port, user, and password are correct.' }
    $databaseExistsText = ($databaseExists | Out-String).Trim()
    if ($databaseExistsText -ne '1') {
        & createdb -h $dbHost -p $dbPort -U $dbUser $dbName
        if ($LASTEXITCODE -ne 0) { throw "Could not create database '$dbName'." }
        Write-Host "Created database '$dbName'." -ForegroundColor Green
    } else {
        Write-Host "Database '$dbName' already exists; leaving its data intact." -ForegroundColor Yellow
    }
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host "`nInstalling backend dependencies..." -ForegroundColor Cyan
& npm run install:server
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }

Write-Host "`nApplying database migrations..." -ForegroundColor Cyan
& npm run migrate
if ($LASTEXITCODE -ne 0) { throw 'Database migration failed. Check PostgreSQL and server/.env.' }

Write-Host "`nCreating teacher and student accounts..." -ForegroundColor Cyan
& npm run seed
if ($LASTEXITCODE -ne 0) { throw 'Account seeding failed.' }

Write-Host "`nRunning backend tests..." -ForegroundColor Cyan
& npm test
if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed.' }

Write-Host "`nSetup completed." -ForegroundColor Green
Write-Host 'Start ExamPortal with: npm run dev'
Write-Host 'Then open: http://localhost:5000'
Write-Host 'Health check: http://localhost:5000/api/health'
Write-Host 'Teacher and student credentials are the ones entered during setup. Do not commit server/.env.'
