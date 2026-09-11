@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Rakha Auth
color 0A

echo.
echo  ========================================
echo    Rakha Auth - Install ^& Start
echo  ========================================
echo.

:: Default port (overridden by .env PORT=)
set "APP_PORT=5050"

where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH.
    echo Download: https://nodejs.org/
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm was not found.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do echo [*] Node %%v
for /f "tokens=*" %%v in ('npm -v') do echo [*] npm  %%v
echo.

if not exist ".env" (
    if exist ".env.example" (
        echo [!] .env not found — copying from .env.example
        copy /Y ".env.example" ".env" >nul
        echo [!] Edit .env with your settings, then run start.bat again if needed.
        echo.
    ) else (
        echo ERROR: Missing .env and .env.example
        pause
        exit /b 1
    )
)

if exist ".env" (
    for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
        set "KEY=%%A"
        set "VAL=%%B"
        if /i "!KEY!"=="PORT" (
            set "APP_PORT=!VAL!"
        )
    )
)

for /f "tokens=* delims= " %%P in ("%APP_PORT%") do set "APP_PORT=%%P"

echo [1/3] Installing Backend packages...
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install backend packages!
    pause
    exit /b 1
)
echo.

echo [2/3] Installing Frontend packages...
pushd client
call npm install
if errorlevel 1 (
    popd
    echo ERROR: Failed to install frontend packages!
    pause
    exit /b 1
)
popd
echo.

echo [*] Freeing port %APP_PORT% if busy...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%APP_PORT% " ^| findstr "LISTENING"') do (
    echo     Killing PID %%P
    taskkill /F /PID %%P >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo [3/3] Building frontend...
pushd client
call npm run build
if errorlevel 1 (
    popd
    echo ERROR: Frontend build failed!
    pause
    exit /b 1
)
popd

echo.
echo [*] Starting Rakha Auth server...
echo [*] Open your browser at the APP_URL from your .env file
echo.
call node server.js

echo.
echo [*] Server stopped.
pause
endlocal
