$PALOVA_PATH = "C:\Users\e.nougayrede\OneDrive - BAYARD PRESSE\IA\05_PERSO\RESERVE\palova"
$DOCKER_COMPOSE = "C:\Program Files\Docker\Docker\resources\bin\docker-compose-v1.exe"
$DOCKER_DESKTOP = "C:\Program Files\Docker\Docker\Docker Desktop.exe"

Write-Host "`nPalova Startup" -ForegroundColor Cyan
Write-Host ("=" * 40) -ForegroundColor Cyan

# Verifier si Docker daemon tourne
Write-Host "`nChecking Docker..." -ForegroundColor Yellow
$dockerRunning = $false
try {
    docker ps 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $dockerRunning = $true }
} catch { }

# Demarrer Docker Desktop si pas lance
if (-not $dockerRunning) {
    if (-not (Test-Path $DOCKER_DESKTOP)) {
        Write-Host "Docker Desktop not found at $DOCKER_DESKTOP" -ForegroundColor Red
        exit 1
    }

    Write-Host "Docker not running, starting Docker Desktop..." -ForegroundColor Yellow
    Start-Process $DOCKER_DESKTOP

    Write-Host "Waiting for Docker to be ready (up to 60s)..." -ForegroundColor Yellow
    $timeout = 60
    for ($i = 0; $i -lt $timeout; $i++) {
        Start-Sleep -Seconds 1
        try {
            docker ps 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) {
                $dockerRunning = $true
                break
            }
        } catch { }
        Write-Host -NoNewline "."
    }
    Write-Host ""

    if (-not $dockerRunning) {
        Write-Host "Docker Desktop failed to start. Please launch it manually." -ForegroundColor Red
        exit 1
    }
}

Write-Host "Docker is running" -ForegroundColor Green

# Verifier Docker Compose
if (-not (Test-Path $DOCKER_COMPOSE)) {
    Write-Host "Docker Compose v1 not found" -ForegroundColor Red
    exit 1
}

# Demarrer les conteneurs
Write-Host "`nStarting containers (Postgres + Redis)..." -ForegroundColor Yellow
Push-Location $PALOVA_PATH
& $DOCKER_COMPOSE up -d 2>$null
Pop-Location

# Attendre Postgres
Write-Host "Waiting for PostgreSQL..." -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        docker exec palova_postgres_1 pg_isready -U palovauser 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $ready = $true
            break
        }
    } catch { }
    Start-Sleep -Seconds 1
}

if ($ready) {
    Write-Host "PostgreSQL ready" -ForegroundColor Green
} else {
    Write-Host "PostgreSQL timeout (continuing...)" -ForegroundColor Yellow
}

# Backend dans nouvelle fenetre
Write-Host "`nLaunching Backend..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PALOVA_PATH\backend'; if (-not (Test-Path 'node_modules')) { npm install 2>&1 | Out-Null; npx prisma generate 2>&1 | Out-Null }; npm run dev"

# Frontend dans nouvelle fenetre
Write-Host "Launching Frontend..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PALOVA_PATH\frontend'; if (-not (Test-Path 'node_modules')) { npm install 2>&1 | Out-Null }; npm run dev"

# Prisma Studio dans nouvelle fenetre (port fixe, sans ouvrir le navigateur)
Write-Host "Launching Prisma Studio..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PALOVA_PATH\backend'; npx prisma studio --port 5555 --browser none"

# Message final
Write-Host "`nAll services launching!" -ForegroundColor Green
Write-Host "Backend  -> http://localhost:3001" -ForegroundColor Gray
Write-Host "Frontend -> http://localhost:3000" -ForegroundColor Gray
Write-Host "Studio   -> http://localhost:5555" -ForegroundColor Gray
Write-Host "`n(4 windows opened: this one, backend, frontend, studio)" -ForegroundColor Gray
Write-Host ("=" * 40) -ForegroundColor Cyan
