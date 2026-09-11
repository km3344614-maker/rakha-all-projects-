@echo off
setlocal EnableExtensions EnableDelayedExpansion
title RAKHA DISCORD DELIVERY BOT
color 0B

echo.
echo  ======================================================
echo      RAKHA SERVICES - DISCORD DELIVERY BOT (DM SENDER)
echo  ======================================================
echo.

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not in PATH!
    pause
    exit /b 1
)

echo [*] Starting Rakha Delivery Bot with Token MTU0NTAxODU2...
node index.js

pause
