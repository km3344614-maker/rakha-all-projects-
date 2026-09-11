@echo off
title Create Restore Point - RAKHA TWEAKS

:: 1. Check for Administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -NoProfile -Command "Start-Process cmd.exe -Verb RunAs -ArgumentList '/c \"\"%~f0\"\"'"
    exit /b
)

echo ======================================================
echo  RAKHA TWEAKS - SYSTEM RESTORE POINT
echo ======================================================
echo.

:: 2. Ensure Volume Shadow Copy (VSS) and Software Shadow Provider services are active
echo [1/4] Starting Volume Shadow Copy (VSS) Services...
sc config vss start= auto >nul 2>&1
net start vss >nul 2>&1
sc config swprv start= auto >nul 2>&1
net start swprv >nul 2>&1

:: 3. Enable System Protection in Registry
echo [2/4] Enabling System Protection on System Drive...
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore" /v "DisableSR" /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore" /v "DisableConfig" /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore" /v "SystemRestorePointCreationFrequency" /t REG_DWORD /d 0 /f >nul 2>&1

:: 4. Enable System Restore on C: drive via PowerShell and allocate space
echo [3/4] Enabling Computer Restore on C: ...
powershell -NoProfile -Command "Enable-ComputerRestore -Drive 'C:\' -ErrorAction SilentlyContinue" >nul 2>&1
vssadmin resize shadowstorage /for=C: /on=C: /maxsize=5% >nul 2>&1

:: 5. Create the Restore Point
echo [4/4] Creating System Restore Point "RAKHA TWEAKS"...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Checkpoint-Computer -Description 'RAKHA TWEAKS' -RestorePointType MODIFY_SETTINGS"

if %errorLevel% equ 0 (
    echo.
    echo ======================================================
    echo  [SUCCESS] System Restore Point "RAKHA TWEAKS" created successfully!
    echo ======================================================
    reg delete "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore" /v "SystemRestorePointCreationFrequency" /f >nul 2>&1
    timeout /t 3 >nul
) else (
    echo.
    echo ======================================================
    echo  [NOTICE] Please ensure System Protection is ON for C:
    echo  Opening Windows System Protection Settings for you...
    echo ======================================================
    start SystemPropertiesProtection.exe
    pause
)
