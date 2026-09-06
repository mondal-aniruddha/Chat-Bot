# Windows Desktop AI Assistant - Full-Stack Web Launcher
# Starts the Node.js Express backend and React Vite frontend.

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Starting Windows Desktop AI Voice Assistant Web Console   " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$projectRoot = $PSScriptRoot
$serverDir = Join-Path $projectRoot "server"
$frontendDir = Join-Path $projectRoot "frontend"

# 1. Start Node.js Bridge Server
Write-Host "`n[1/2] Starting Node.js API Bridge (Port 5000)..." -ForegroundColor Yellow
$serverProcess = Start-Process -FilePath "node" -ArgumentList "index.js" -WorkingDirectory $serverDir -PassThru -NoNewWindow

Start-Sleep -Seconds 2

# 2. Start Vite Dev Server
Write-Host "`n[2/2] Starting React Vite Frontend (Port 5173)..." -ForegroundColor Yellow
Write-Host "`n>>> Open http://localhost:5173 in your browser <<<`n" -ForegroundColor Green

Set-Location $frontendDir
try {
    & npm.cmd run dev
} finally {
    Write-Host "`nShutting down backend server..." -ForegroundColor Yellow
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    Set-Location $projectRoot
}
