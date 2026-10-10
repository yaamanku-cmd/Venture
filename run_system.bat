@echo off
title FraudShield AI - Launching System
echo ==========================================================
echo   FRAUDSHIELD AI - REAL-TIME FRAUD DETECTION SYSTEM
echo ==========================================================

echo [1/3] Starting FastAPI Backend on http://localhost:8000...
start "FraudShield Backend" cmd /k "python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000"
timeout /t 2 /nobreak >nul

echo [2/3] Starting Vite React Frontend on http://localhost:5173...
cd frontend
start "FraudShield Dashboard" cmd /k "npm run dev"
cd ..
timeout /t 2 /nobreak >nul

echo [3/3] Opening Dashboard in browser...
start http://localhost:5173

echo ==========================================================
echo System is running!
echo To start transaction replay:
echo   python backend\streamer.py --shuffle
echo ==========================================================
pause
