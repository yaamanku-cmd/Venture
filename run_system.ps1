# FraudShield AI - Full System Startup Script
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  FRAUDSHIELD AI - REAL-TIME FRAUD DETECTION SYSTEM       " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Start FastAPI Backend in background
Write-Host "`n[1/3] Starting FastAPI Backend on http://localhost:8000..." -ForegroundColor Green
$BackendProcess = Start-Process -FilePath "python" -ArgumentList "-m uvicorn backend.main:app --host 127.0.0.1 --port 8000" -PassThru -NoNewWindow

Start-Sleep -Seconds 2

# 2. Start Frontend Dev Server in background
Write-Host "`n[2/3] Starting Vite React Dashboard on http://localhost:5173..." -ForegroundColor Green
$FrontendProcess = Start-Process -FilePath "npm" -ArgumentList "run dev" -WorkingDirectory "frontend" -PassThru -NoNewWindow

Start-Sleep -Seconds 3

# 3. Open Browser
Write-Host "`n[3/3] Launching Dashboard in default browser..." -ForegroundColor Green
Start-Process "http://localhost:5173"

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "System is LIVE!" -ForegroundColor Yellow
Write-Host "Dashboard:  http://localhost:5173" -ForegroundColor White
Write-Host "API Health: http://localhost:8000/health" -ForegroundColor White
Write-Host ""
Write-Host "To stream transactions, open a new terminal and run:" -ForegroundColor Magenta
Write-Host "  python backend/streamer.py --shuffle" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
