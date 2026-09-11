@echo off
setlocal EnableExtensions EnableDelayedExpansion
title RAKHA AUTH AND PROTECTION SERVER
color 0F

echo.
echo  ======================================================
echo     RAKHA SERVICES - PROTECTION AND AUTH CONTROL PANEL
echo  ======================================================
echo.

cd /d "%~dp0"
if not exist "server.js" (
    cd /d "C:\Users\RAKHA\Desktop\RAKHA_PROTECTION_AUTH_WEBSITE"
)

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [*] Starting Rakha Auth Server on http://localhost:5050 ...
echo [*] Opening Web Dashboard in your browser...
echo.

start "" "http://localhost:5050"

node server.js

pause
