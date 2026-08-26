<#
.SYNOPSIS
  Starts (or stops) Mirabel's Docker-based infra: Redis, Chroma, and the Celery
  worker/beat containers defined in docker-compose.yml.

.DESCRIPTION
  Postgres and the Django app itself run natively on this machine (see
  backend/.env and README.md) -- only the pieces docker-compose.yml actually
  defines are managed here.

.PARAMETER Down
  Stop and remove the containers instead of starting them.

.PARAMETER Logs
  After starting, stream logs from all services (Ctrl+C to stop tailing;
  containers keep running).

.EXAMPLE
  .\start-docker.ps1
  .\start-docker.ps1 -Logs
  .\start-docker.ps1 -Down
#>
param(
    [switch]$Down,
    [switch]$Logs
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Test-DockerRunning {
    docker info *> $null
    return $?
}

if (-not (Test-DockerRunning)) {
    Write-Host "Docker Desktop doesn't seem to be running. Start it and try again." -ForegroundColor Red
    exit 1
}

if ($Down) {
    Write-Host "Stopping Mirabel Docker services (redis, chroma, celery-worker, celery-beat)..." -ForegroundColor Cyan
    docker compose down
    exit $LASTEXITCODE
}

if (-not (Test-Path ".env")) {
    Write-Host "backend\.env not found. Copy .env.example to .env and fill in secrets first." -ForegroundColor Red
    exit 1
}

# Redis is mapped to host port 6380, not the default 6379 -- another
# project's Redis container already had 6379 bound on this machine (see the
# comment in docker-compose.yml). Warn early if 6380 is somehow taken too,
# instead of a cryptic Docker bind-address error later.
$portInUse = Get-NetTCPConnection -LocalPort 6380 -State Listen -ErrorAction SilentlyContinue |
    Where-Object { -not ($_.OwningProcess -and (docker ps -q --filter "name=mirabel-redis")) }
if ($portInUse) {
    $owner = (Get-Process -Id $portInUse[0].OwningProcess -ErrorAction SilentlyContinue).ProcessName
    Write-Host "Port 6380 is already in use (process: $owner) by something that isn't mirabel-redis." -ForegroundColor Yellow
    Write-Host "Check 'docker ps' for a conflicting container before continuing." -ForegroundColor Yellow
}

Write-Host "Starting Mirabel Docker services (redis, chroma, celery-worker, celery-beat)..." -ForegroundColor Cyan
docker compose up -d --build

if ($LASTEXITCODE -ne 0) {
    Write-Host "docker compose up failed -- see output above." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
docker compose ps
Write-Host ""
Write-Host "Redis:  localhost:6380" -ForegroundColor Green
Write-Host "Chroma: localhost:8001" -ForegroundColor Green
Write-Host ""
Write-Host "Postgres and the Django app run natively -- see README.md for:" -ForegroundColor DarkGray
Write-Host "  cd backend; .venv\Scripts\activate; python manage.py migrate; python manage.py runserver" -ForegroundColor DarkGray

if ($Logs) {
    docker compose logs -f
}
