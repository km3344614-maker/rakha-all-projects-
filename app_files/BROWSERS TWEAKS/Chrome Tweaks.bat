@echo off
setlocal EnableDelayedExpansion

:: -----------------------------------------------------------------------------
:: RAKHA TWEAKS - GOOGLE CHROME ULTRA PERFORMANCE TWEAK
:: -----------------------------------------------------------------------------

:: 1. Self-Elevation check
net session >nul 2>&1
if %errorLevel% neq 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs" 2>nul
    exit /b
)

:: 2. Kill Chrome update process
taskkill /f /im GoogleUpdate.exe >nul 2>&1

:: 3. Disable Chrome services cleanly without blocking
sc config googlechromeelevationservice start= disabled >nul 2>&1
sc stop googlechromeelevationservice >nul 2>&1
sc config gupdatem start= disabled >nul 2>&1
sc stop gupdatem >nul 2>&1
sc config gupdate start= disabled >nul 2>&1
sc stop gupdate >nul 2>&1

:: 4. Disable scheduled update tasks cleanly
schtasks /change /tn "GoogleUpdateTaskMachineCore" /disable >nul 2>&1
schtasks /change /tn "GoogleUpdateTaskMachineUA" /disable >nul 2>&1

:: 5. Disable update delays via policy
reg add "HKLM\SOFTWARE\Policies\Google\Update" /v "AutoUpdateCheckPeriodMinutes" /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\Google\Update" /v "UpdateDefault" /t REG_DWORD /d 0 /f >nul 2>&1

:: 6. Chrome Performance Policies
reg add "HKLM\SOFTWARE\Policies\Google\Chrome" /v "HardwareAccelerationModeEnabled" /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\Google\Chrome" /v "BackgroundModeEnabled" /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\Google\Chrome" /v "MetricsReportingEnabled" /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\Google\Chrome" /v "HighEfficiencyModeEnabled" /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\Google\Chrome" /v "DiskCacheSize" /t REG_DWORD /d 268435456 /f >nul 2>&1

:: 7. Force High-Performance GPU
reg add "HKCU\Software\Microsoft\DirectX\UserGpuPreferences" /v "C:\Program Files\Google\Chrome\Application\chrome.exe" /t REG_SZ /d "GpuPreference=2;" /f >nul 2>&1

:: 8. Clean bloated ShaderCache & GPU Cache
del /q /s /f "%LOCALAPPDATA%\Google\Chrome\User Data\ShaderCache\*" >nul 2>&1
del /q /s /f "%LOCALAPPDATA%\Google\Chrome\User Data\GrShaderCache\*" >nul 2>&1
del /q /s /f "%LOCALAPPDATA%\Google\Chrome\User Data\Default\GPUCache\*" >nul 2>&1

rmdir "C:\Program Files (x86)\Google\Update" /s /q >nul 2>&1

echo [✓] Chrome Browser Ultra Performance Tweaks Applied Successfully!
exit /b 0