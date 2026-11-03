@echo off
title Stop Upstox Algo Trading Platform
cd /d "%~dp0"

echo =======================================================
echo   Stopping Upstox Algo Trading Platform (Ports 8000, 3005)
echo =======================================================
echo.

powershell -Command "Get-NetTCPConnection -LocalPort 8000, 3005 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo.
echo Both servers stopped.
timeout /t 2 >nul
exit

