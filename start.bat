@echo off
title Upstox Algo Trading Platform Launcher
cd /d "%~dp0"

echo =======================================================
echo   Starting Upstox Algo Trading Platform
echo =======================================================
echo.
echo [1/2] Launching FastAPI Backend on http://localhost:8000 ...
start "Upstox Algo Backend (Port 8000)" cmd /k "cd /d ""%~dp0"" && python backend/run.py"

timeout /t 3 /nobreak >nul

echo [2/2] Launching Next.js Frontend on http://localhost:3005 ...
start "Upstox Algo Frontend (Port 3005)" cmd /k "cd /d ""%~dp0"" && npm.cmd run dev"

timeout /t 3 /nobreak >nul

echo.
echo Opening Dashboard in your browser...
start http://localhost:3005

echo.
echo =======================================================
echo   Both services are now running!
echo   - Frontend: http://localhost:3005
echo   - Backend:  http://localhost:8000/docs
echo =======================================================
echo.
echo You can minimize this window.
pause

