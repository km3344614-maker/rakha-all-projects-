@echo off
setlocal EnableDelayedExpansion

:: -----------------------------------------------------------------------------
:: RAKHA TWEAKS - BRAVE BROWSER ULTRA PERFORMANCE & 0-DELAY TWEAK
:: -----------------------------------------------------------------------------

:: 1. Self-Elevation check (instant, safe)
net session >nul 2>&1
if %errorLevel% neq 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs" 2>nul
    exit /b
)

:: 2. Fast kill of Brave update processes
taskkill /f /im BraveUpdate.exe >nul 2>&1
taskkill /f /im brave_installer.exe >nul 2>&1

:: 3. Disable Brave services cleanly without blocking (NO 'net stop' hang!)
sc config brave start= disabled >nul 2>&1
sc stop brave >nul 2>&1
sc config bravem start= disabled >nul 2>&1
sc stop bravem >nul 2>&1
sc config BraveElevationService start= disabled >nul 2>&1
sc stop BraveElevationService >nul 2>&1

:: 4. Disable scheduled update tasks cleanly (Prevents TaskCache corruption)
schtasks /change /tn "BraveSoftwareUpdateTaskMachineCore" /disable >nul 2>&1
schtasks /change /tn "BraveSoftwareUpdateTaskMachineUA" /disable >nul 2>&1

:: 5. Set Group Policies to disable update checks & remove startup hang delays
reg add "HKLM\SOFTWARE\Policies\BraveSoftware\Update" /v "AutoUpdateCheckPeriodMinutes" /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\BraveSoftware\Update" /v "UpdateDefault" /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\BraveSoftware\Update" /v "DisableAutoUpdateChecksCheckboxValue" /t REG_DWORD /d 1 /f >nul 2>&1

:: 6. Ultra-Performance Policies for Brave (Hardware Acceleration, Zero Background Overhead)
reg add "HKLM\SOFTWARE\Policies\BraveSoftware\Brave" /v "HardwareAccelerationModeEnabled" /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\BraveSoftware\Brave" /v "BackgroundModeEnabled" /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\BraveSoftware\Brave" /v "MetricsReportingEnabled" /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\BraveSoftware\Brave" /v "DiagnosticData" /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\BraveSoftware\Brave" /v "BraveRewardsDisabled" /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\BraveSoftware\Brave" /v "BraveWalletDisabled" /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\BraveSoftware\Brave" /v "BraveVPNDisabled" /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\BraveSoftware\Brave" /v "BraveAIChatEnabled" /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\BraveSoftware\Brave" /v "HighEfficiencyModeEnabled" /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\BraveSoftware\Brave" /v "DiskCacheSize" /t REG_DWORD /d 268435456 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\BraveSoftware\Brave" /v "RendererCodeIntegrityEnabled" /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\BraveSoftware\Brave" /v "DefaultBrowserSettingEnabled" /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\BraveSoftware\Brave" /v "TabHoverCardImages" /t REG_DWORD /d 0 /f >nul 2>&1

:: 7. Force High-Performance Dedicated GPU (NVIDIA RTX) for Brave
reg add "HKCU\Software\Microsoft\DirectX\UserGpuPreferences" /v "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" /t REG_SZ /d "GpuPreference=2;" /f >nul 2>&1

:: 8. Clean bloated ShaderCache & GPU Cache (Fixes stuttering & micro-lags)
del /q /s /f "%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\ShaderCache\*" >nul 2>&1
del /q /s /f "%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\GrShaderCache\*" >nul 2>&1
del /q /s /f "%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\Default\GPUCache\*" >nul 2>&1
del /q /s /f "%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\Default\DawnWebGPUCache\*" >nul 2>&1
del /q /s /f "%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\Default\DawnGraphiteCache\*" >nul 2>&1
del /q /s /f "%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\Crashpad\reports\*" >nul 2>&1

:: 9. Remove legacy update directory safely
rmdir "C:\Program Files (x86)\BraveSoftware\Update" /s /q >nul 2>&1

echo [✓] Brave Browser Ultra Performance Tweaks Applied Successfully!
exit /b 0