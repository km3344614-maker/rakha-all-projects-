@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Rakha Key Gen - Official Discord Bot
color 0F

echo.
echo  ======================================================
echo    RAKHA KEY GEN - OFFICIAL DISCORD BOT
echo    By: rakha | Support: mohamed
echo    Color Theme: Pure White (0xFFFFFF)
echo  ======================================================
echo.


if not exist "node_modules" (
    echo [*] Installing dependencies...
    call npm install
)

echo [*] Launching Discord Bot...
node index.js
pause
endlocal
