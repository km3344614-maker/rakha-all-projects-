@echo off
if not "%1"=="max" (
    start /MAX cmd /c "%~f0" max
    exit /b
)
powershell -NoProfile -Command "$w = Add-Type -memberDefinition '[DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);' -name 'W' -namespace Win32 -passThru; $w::ShowWindow((Get-Process -Id $PID).MainWindowHandle, 3)" >nul 2>&1
mode con: cols=122 lines=42
chcp 65001 >nul 2>&1
title RAKHA ZERO DELAY TWEAKS - ULTRA PERFORMANCE ENGINE
color 0b

:: Enable Virtual Terminal & Generate ESC Character
Reg.exe add "HKCU\CONSOLE" /v "VirtualTerminalLevel" /t REG_DWORD /d "1" /f > nul 2>&1
for /f "delims=" %%a in ('powershell -NoProfile -Command "[char]27"') do set "ESC=%%a"

set "cyan=%ESC%[96m"
set "blue=%ESC%[94m"
set "bright=%ESC%[97m"
set "yellow=%ESC%[93m"
set "green=%ESC%[92m"
set "gray=%ESC%[90m"
set "bold=%ESC%[1m"
set "reset=%ESC%[0m"

set "color1=%blue%"
set "color2=%cyan%"
set "s4=%green%"
set "y=%cyan%"
set "r=%blue%"
set "c2=%reset%"
set "c3=%cyan%"
set "red=%cyan%"
set "darkred=%blue%"
set "w=%bright%"

setlocal EnableDelayedExpansion > nul
cls
echo.
echo %cyan%%bold%  ========================================================================================%reset%
echo %bright%%bold%                 ⚡ INITIALIZING RAKHA ZERO DELAY TWEAKS ENGINE ⚡                      %reset%
echo %cyan%%bold%  ========================================================================================%reset%
timeout /t 1 /nobreak > NUL

powershell -NoProfile Enable-ComputerRestore -Drive 'C:\'>nul 2>&1
Reg.exe delete "HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore" /v "RPSessionInterval" /f >nul 2>&1 
Reg.exe delete "HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore" /v "DisableConfig" /f >nul 2>&1
Reg.exe add "HKLM\Software\Microsoft\Windows NT\CurrentVersion\SystemRestore" /v "SystemRestorePointCreationFrequency" /t REG_DWORD /d 0 /f >nul 2>&1

rmdir %SystemDrive%\Windows\system32\adminrightstest >nul 2>&1
mkdir %SystemDrive%\Windows\system32\adminrightstest >nul 2>&1
if %errorlevel% neq 0 (
    chcp 65001 >nul 2>&1
    cls
    echo.
    echo %yellow%[!] Requesting Administrator Privileges...%reset%
    timeout /t 1 /nobreak > NUL
    chcp 437 >nul 2>&1
    powershell -NoProfile -NonInteractive -Command start -verb runas "'%~s0'"
    exit /b
)

:restore_point
chcp 65001 >nul 2>&1
CLS
echo.
echo %blue%╔════════════════════════════════════════════════════════════════════════════════════════════════════════════╗%reset%
echo %blue%║ %cyan%%bold%   ██████╗ ███████╗███████╗████████╗ ██████╗ ██████╗ ███████╗   ██████╗  ████████╗   %blue%║%reset%
echo %blue%║ %cyan%%bold%   ██╔══██╗██╔════╝██╔════╝╚══██╔══╝██╔═══██╗██╔══██╗██╔════╝   ██╔══██╗ ╚══██╔══╝   %blue%║%reset%
echo %blue%║ %cyan%%bold%   ██████╔╝█████╗  ███████╗   ██║   ██║   ██║██████╔╝█████╗     ██████╔╝    ██║      %blue%║%reset%
echo %blue%║ %cyan%%bold%   ██╔══██╗██╔══╝  ╚════██║   ██║   ██║   ██║██╔══██╗██╔══╝     ██╔═══╝     ██║      %blue%║%reset%
echo %blue%║ %cyan%%bold%   ██║  ██║███████╗███████║   ██║   ╚██████╔╝██║  ██║███████╗   ██║         ██║      %blue%║%reset%
echo %blue%║ %cyan%%bold%   ╚═╝  ╚═╝╚══════╝╚══════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚══════╝   ╚═╝         ╚═╝      %blue%║%reset%
echo %blue%╚════════════════════════════════════════════════════════════════════════════════════════════════════════════╝%reset%
echo.
echo   %cyan%[%bright% 1 %cyan%]%reset% %bold%Create System Restore Point%reset% %gray%(Recommended before applying optimizations)%reset%
echo.
echo   %cyan%[%bright% 2 %cyan%]%reset% %bold%Skip & Proceed to Tweaks Menu%reset%
echo.
echo   %cyan%[%bright% 3 %cyan%]%reset% %bold%Open Windows System Restore GUI%reset%
echo.
set /p rchoice="  %cyan%Choose an option [1-3]: %reset%"

if '%rchoice%'=='1' goto restore_menu
if '%rchoice%'=='2' goto menu
if '%rchoice%'=='3' goto restore
goto restore_point

:restore
cls
rstrui.exe
goto menu

:restore_menu
cls
echo.
echo  %yellow%[*] Creating Rakha System Restore Point...%reset%
chcp 437 >nul 
powershell -Command "Checkpoint-Computer -Description 'Rakha Zero Delay Restore Point' -RestorePointType 'MODIFY_SETTINGS'" 
chcp 65001 >nul 
echo  %green%[+] Restore Point Created Successfully!%reset%
timeout /t 2 >nul
goto menu

:menu
cls
echo.
echo %blue%╔════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗%reset%
echo %blue%║                                %cyan%%bold%⚡ RAKHA ZERO DELAY TWEAKS - ULTRA PERFORMANCE ENGINE ⚡%reset%%blue%                                ║%reset%
echo %blue%╠════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣%reset%
echo %blue%║                                %bright%MAXIMUM FPS & LOWEST SYSTEM LATENCY OPTIMIZATION%reset%%blue%                                        ║%reset%
echo %blue%╠════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣%reset%
echo %blue%║                                                                                                                        ║%reset%
echo %blue%║   %cyan%[%bright% 1 %cyan%]%reset% %bold%Registry Optimization Tweaks%reset%          %cyan%[%bright% 2 %cyan%]%reset% %bold%Power & Ultimate Powerplan Setup%reset%                                   %blue%║%reset%
echo %blue%║   %cyan%[%bright% 3 %cyan%]%reset% %bold%Windows Debloat & Telemetry Off%reset%       %cyan%[%bright% 4 %cyan%]%reset% %bold%Deep System & Cache Cleaner%reset%                                        %blue%║%reset%
echo %blue%║   %cyan%[%bright% 5 %cyan%]%reset% %bold%GPU Maximum Performance Boost%reset%         %cyan%[%bright% 6 %cyan%]%reset% %bold%Mouse & Keyboard Zero Input Delay%reset%                                  %blue%║%reset%
echo %blue%║   %cyan%[%bright% 7 %cyan%]%reset% %bold%Game & Process High Priority%reset%          %cyan%[%bright% 8 %cyan%]%reset% %bold%Disable Laggy Windows Animations%reset%                                   %blue%║%reset%
echo %blue%║   %cyan%[%bright% 9 %cyan%]%reset% %bold%CPU Core Unparking & Latency%reset%          %cyan%[%bright% 10 %cyan%]%reset% %bold%USB Controller & Polling Boost%reset%                                    %blue%║%reset%
echo %blue%║   %cyan%[%bright% 11 %cyan%]%reset% %bold%0 Delay Ultimate Latency Pack%reset%        %cyan%[%bright% 12 %cyan%]%reset% %bold%Apply ALL Tweaks Simultaneously%reset%                                   %blue%║%reset%
echo %blue%║                                                                                                                        ║%reset%
echo %blue%╠════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣%reset%
echo %blue%║   %cyan%[%bright% R %cyan%]%reset% %bold%System Restore Point Menu%reset%             %cyan%[%bright% X %cyan%]%reset% %bold%Exit Tweaker%reset%                                                       %blue%║%reset%
echo %blue%╚════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝%reset%
echo.
set choice=
set /p choice="  %cyan%Choose an option: %reset%"

if '%choice%'=='1' goto optimize_registry
if '%choice%'=='2' goto power_tweaks
if '%choice%'=='3' goto optimize_windows
if '%choice%'=='4' goto clean
if '%choice%'=='5' goto nvidia_gpu
if '%choice%'=='6' goto mouse_keyboard
if '%choice%'=='7' goto high_priority
if '%choice%'=='8' goto disable_animations
if '%choice%'=='9' goto cpu_tweaks
if '%choice%'=='10' goto usb_tweaks
if '%choice%'=='11' goto 0delay
if '%choice%'=='12' goto apply_all_tweaks
if /i '%choice%'=='r' goto restore_point
if /i '%choice%'=='x' exit /b
goto menu

:apply_all_tweaks
cls
echo.
echo %cyan%%bold%  ========================================================================================%reset%
echo %bright%%bold%                    APPLYING ALL RAKHA TWEAKS CONSECUTIVELY...                           %reset%
echo %cyan%%bold%  ========================================================================================%reset%
timeout /t 1 >nul
call :optimize_registry_silent
call :power_tweaks_silent
call :optimize_windows_silent
call :clean_silent
call :nvidia_gpu_silent
call :mouse_keyboard_silent
call :high_priority_silent
call :disable_animations_silent
call :cpu_tweaks_silent
call :usb_tweaks_silent
call :0delay_silent
cls
echo.
echo %green%%bold%  ========================================================================================%reset%
echo %bright%%bold%                    ALL RAKHA ZERO DELAY TWEAKS APPLIED SUCCESSFULLY!                    %reset%
echo %green%%bold%  ========================================================================================%reset%
pause
goto menu

:optimize_registry_silent
:optimize_registry
CLS
echo.
echo %color1%╔══════════════════════════════════════════════════════════════════╗
echo %color1%║ %color2%██████╗ ███████╗ ██████╗ ██╗███████╗████████╗██████╗ ██╗   ██╗   %color1%║
echo %color1%║ %color2%██╔══██╗██╔════╝██╔════╝ ██║██╔════╝╚══██╔══╝██╔══██╗╚██╗ ██╔╝   %color1%║
echo %color1%║ %color2%██████╔╝█████╗  ██║  ███╗██║███████╗   ██║   ██████╔╝ ╚████╔╝    %color1%║ 
echo %color1%║ %color2%██╔══██╗██╔══╝  ██║   ██║██║╚════██║   ██║   ██╔══██╗  ╚██╔╝     %color1%║  
echo %color1%║ %color2%██║  ██║███████╗╚██████╔╝██║███████║   ██║   ██║  ██║   ██║      %color1%║   
echo %color1%║ %color2%╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝      %color1%║  
echo %color1%║                                                                  %color1%║     
echo %color1%║ %color2%    ████████╗██╗    ██╗███████╗ █████╗ ██╗  ██╗███████╗          %color1%║       
echo %color1%║ %color2%    ╚══██╔══╝██║    ██║██╔════╝██╔══██╗██║ ██╔╝██╔════╝          %color1%║       
echo %color1%║ %color2%       ██║   ██║ █╗ ██║█████╗  ███████║█████╔╝ ███████╗          %color1%║       
echo %color1%║ %color2%       ██║   ██║███╗██║██╔══╝  ██╔══██║██╔═██╗ ╚════██║          %color1%║       
echo %color1%║ %color2%       ██║   ╚███╔███╔╝███████╗██║  ██║██║  ██╗███████║          %color1%║       
echo %color1%║ %color2%       ╚═╝    ╚══╝╚══╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝          %color1%║       
echo %color1%╚══════════════════════════════════════════════════════════════════╝%reset%
                                                             
echo Optimizing Registry...
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager" /v "SubscribedContent-338393Enabled" /t REG_DWORD /d "0" /f
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager" /v "SubscribedContent-353694Enabled" /t REG_DWORD /d "0" /f
Reg.exe add "HKEY_LOCAL_MACHINE\Software\Microsoft\Windows\CurrentVersion\Policies\Attachments" /v "SaveZoneInformation" /t REG_DWORD /d "1" /f
Reg.exe add "HKEY_LOCAL_MACHINE\System\CurrentControlSet\Control\Diagnostics\Performance" /v "DisableDiagnosticTracing" /t REG_DWORD /d "1" /f >nul 2>&1 
Reg.exe add "HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\WDI\{9c5a40da-b965-4fc3-8781-88dd50a6299d}" /v "ScenarioExecutionEnabled" /t REG_DWORD /d "0" /f
schtasks /change /tn "\Microsoft\Windows\Application Experience\StartupAppTask" /disable
schtasks /end /tn "\Microsoft\Windows\DiskDiagnostic\Microsoft-Windows-DiskDiagnosticDataCollector"
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager" /v "SubscribedContent-353696Enabled" /t REG_DWORD /d "0" /f
Reg.exe add "HKCU\SOFTWARE\Microsoft\Speech_OneCore\Settings\OnlineSpeechPrivacy" /v "HasAccepted" /t REG_DWORD /d "0" /f
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\PriorityControl" /v "ConvertibleSlateMode" /t REG_DWORD /d "0" /f
Reg.exe add "HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Privacy" /v "TailoredExperiencesWithDiagnosticDataEnabled" /t REG_DWORD /d "0" /f
Reg.exe add "HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Diagnostics\DiagTrack" /v "ShowedToastAtLevel" /t REG_DWORD /d "1" /f
Reg.exe add "HKEY_CURRENT_USER\Software\Microsoft\Input\TIPC" /v "Enabled" /t REG_DWORD /d "0" /f
Reg.exe add "HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\System" /v "UploadUserActivities" /t REG_DWORD /d "0" /f
schtasks /change /tn "\Microsoft\Windows\DiskDiagnostic\Microsoft-Windows-DiskDiagnosticResolver" /disable
schtasks /end /tn "\Microsoft\Windows\Power Efficiency Diagnostics\AnalyzeSystem"
schtasks /change /tn "\Microsoft\Windows\Power Efficiency Diagnostics\AnalyzeSystem" /disable
Reg.exe add "HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\System" /v "PublishUserActivities" /t REG_DWORD /d "0" /f
Reg.exe add "HKEY_CURRENT_USER\Control Panel\International\User Profile" /v "HttpAcceptLanguageOptOut" /t REG_DWORD /d "1" /f
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\PriorityControl" /v "Win32PrioritySeparation" /t REG_DWORD /d "38" /f
echo ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════╗
echo ║                                          %s4%REGISTRY TWEAKS DONE%r%                                            ║
echo ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════╝
pause
goto menu

:power_tweaks
CLS
echo.
echo %color1%╔══════════════════════════════════════════════════════╗
echo %color1%║ %color2%    ██████╗  ██████╗ ██╗    ██╗███████╗██████╗       %color1%║ 
echo %color1%║ %color2%    ██╔══██╗██╔═══██╗██║    ██║██╔════╝██╔══██╗      %color1%║  
echo %color1%║ %color2%    ██████╔╝██║   ██║██║ █╗ ██║█████╗  ██████╔╝      %color1%║ 
echo %color1%║ %color2%    ██╔═══╝ ██║   ██║██║███╗██║██╔══╝  ██╔══██╗      %color1%║ 
echo %color1%║ %color2%    ██║     ╚██████╔╝╚███╔███╔╝███████╗██║  ██║      %color1%║ 
echo %color1%║ %color2%    ╚═╝      ╚═════╝  ╚══╝╚══╝ ╚══════╝╚═╝  ╚═╝      %color1%║ 
echo %color1%║                                                      %color1%║
echo %color1%║ %color2%████████╗██╗    ██╗███████╗ █████╗ ██╗  ██╗███████╗  %color1%║
echo %color1%║ %color2%╚══██╔══╝██║    ██║██╔════╝██╔══██╗██║ ██╔╝██╔════╝  %color1%║
echo %color1%║ %color2%   ██║   ██║ █╗ ██║█████╗  ███████║█████╔╝ ███████╗  %color1%║
echo %color1%║ %color2%   ██║   ██║███╗██║██╔══╝  ██╔══██║██╔═██╗ ╚════██║  %color1%║
echo %color1%║ %color2%   ██║   ╚███╔███╔╝███████╗██║  ██║██║  ██╗███████║  %color1%║
echo %color1%║ %color2%   ╚═╝    ╚══╝╚══╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝  %color1%║
echo %color1%╚══════════════════════════════════════════════════════╝%reset%                                                  
echo Applying Power Tweaks...
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Power" /v "CoalescingTimerInterval" /t REG_DWORD /d "0" /f
echo Disabled CoalescingTimerInterval
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\75b0ae3f-bce0-45a7-8c89-c9611c25e100" /v "Attributes" /t REG_DWORD /d "2" /f
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\75b0ae3f-bce0-45a7-8c89-c9611c25e100" /v "Affinity" /t REG_DWORD /d "0" /f
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\75b0ae3f-bce0-45a7-8c89-c9611c25e100" /v "Background Only" /t REG_SZ /d "False" /f
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\75b0ae3f-bce0-45a7-8c89-c9611c25e100" /v "Clock Rate" /t REG_DWORD /d "10000" /f
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\75b0ae3f-bce0-45a7-8c89-c9611c25e100" /v "GPU Priority" /t REG_DWORD /d "8" /f
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\75b0ae3f-bce0-45a7-8c89-c9611c25e100" /v "Priority" /t REG_DWORD /d "6" /f
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\75b0ae3f-bce0-45a7-8c89-c9611c25e100" /v "Scheduling Category" /t REG_SZ /d "High" /f
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\75b0ae3f-bce0-45a7-8c89-c9611c25e100" /v "SFIO Priority" /t REG_SZ /d "High" /f
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\75b0ae3f-bce0-45a7-8c89-c9611c25e100" /v "BackgroundPriority" /t REG_DWORD /d "0" /f
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\75b0ae3f-bce0-45a7-8c89-c9611c25e100" /v "Latency Sensitive" /t REG_SZ /d "True" /f
echo Enabling Game Mode...
Reg.exe add "HKCU\SOFTWARE\Microsoft\GameBar" /v "AllowAutoGameMode" /t REG_DWORD /d "1" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\GameBar" /v "AutoGameModeEnabled" /t REG_DWORD /d "1" /f 
echo Importing RAKHA POWERPLAN...
powercfg -duplicatescheme 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c 22222222-2222-2222-2222-222222222222
powercfg -setactive 22222222-2222-2222-2222-222222222222
powercfg -changename 22222222-2222-2222-2222-222222222222 "RAKHA POWERPLAN" "Powerplan for FPS and latency by RAKHA"
powercfg -setacvalueindex 22222222-2222-2222-2222-222222222222 0012ee47-9041-4b5d-9b77-535fba8b1442 6738e2c4-e8a5-4a42-b16a-e040e769756e 0
powercfg -setacvalueindex 22222222-2222-2222-2222-222222222222 0012ee47-9041-4b5d-9b77-535fba8b1442 d3d55efd-c1ff-424e-9dc3-441be7833010 0
powercfg -setacvalueindex 22222222-2222-2222-2222-222222222222 0012ee47-9041-4b5d-9b77-535fba8b1442 d639518a-e56d-4345-8af2-b9f32fb26109 0
powercfg -setacvalueindex 22222222-2222-2222-2222-222222222222 0012ee47-9041-4b5d-9b77-535fba8b1442 fc7372b6-ab2d-43ee-8797-15e9841f2cca 0
powercfg -setacvalueindex 22222222-2222-2222-2222-222222222222 0d7dbae2-4294-402a-ba8e-26777e8488cd 309dce9b-bef4-4119-9921-a851fb12f0f4 1
powercfg -setactive scheme_current
echo ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════╗
echo ║                                             %s4%POWER TWEAKS DONE%r%                                            ║
echo ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════╝
pause
goto menu

:optimize_windows
CLS
echo.
echo %color1%╔══════════════════════════════════════════════════════════════╗
echo %color1%║ %color2%██╗    ██╗██╗███╗   ██╗██████╗  ██████╗ ██╗    ██╗███████╗   %color1%║
echo %color1%║ %color2%██║    ██║██║████╗  ██║██╔══██╗██╔═══██╗██║    ██║██╔════╝   %color1%║
echo %color1%║ %color2%██║ █╗ ██║██║██╔██╗ ██║██║  ██║██║   ██║██║ █╗ ██║███████╗   %color1%║
echo %color1%║ %color2%██║███╗██║██║██║╚██╗██║██║  ██║██║   ██║██║███╗██║╚════██║   %color1%║
echo %color1%║ %color2%╚███╔███╔╝██║██║ ╚████║██████╔╝╚██████╔╝╚███╔███╔╝███████║   %color1%║
echo %color1%║ %color2% ╚══╝╚══╝ ╚═╝╚═╝  ╚═══╝╚═════╝  ╚═════╝  ╚══╝╚══╝ ╚══════╝   %color1%║
echo %color1%║                                                              %color1%║
echo %color1%║ %color2%    ████████╗██╗    ██╗███████╗ █████╗ ██╗  ██╗███████╗      %color1%║ 
echo %color1%║ %color2%    ╚══██╔══╝██║    ██║██╔════╝██╔══██╗██║ ██╔╝██╔════╝      %color1%║ 
echo %color1%║ %color2%       ██║   ██║ █╗ ██║█████╗  ███████║█████╔╝ ███████╗      %color1%║ 
echo %color1%║ %color2%       ██║   ██║███╗██║██╔══╝  ██╔══██║██╔═██╗ ╚════██║      %color1%║ 
echo %color1%║ %color2%       ██║   ╚███╔███╔╝███████╗██║  ██║██║  ██╗███████║      %color1%║
echo %color1%║ %color2%       ╚═╝    ╚══╝╚══╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝      %color1%║
echo %color1%╚══════════════════════════════════════════════════════════════╝%reset%                                                          
echo Optimizing Windows Settings...
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync" /v "SyncPolicy" /t REG_DWORD /d "5" /f
echo SyncPolicy
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\Personalization" /v "Enabled" /t REG_DWORD /d "0" /f
echo Disabling Personalization...
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\BrowserSettings" /v "Enabled" /t REG_DWORD /d "0" /f
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\Credentials" /v "Enabled" /t REG_DWORD /d "0" /f
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\Accessibility" /v "Enabled" /t REG_DWORD /d "0" /f
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\Windows" /v "Enabled" /t REG_DWORD /d "0" /f
Reg.exe add "HKCU\Software\Microsoft\Office\16.0\OSM\preventedapplications" /v "accesssolution" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\Software\Microsoft\Office\16.0\OSM\preventedapplications" /v "olksolution" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize" /v "EnableTransparency" /t REG_DWORD /d "0" /f
Reg.exe add "HKCU\Software\Microsoft\Office\16.0\OSM\preventedapplications" /v "onenotesolution" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\Software\Microsoft\Office\16.0\OSM\preventedapplications" /v "pptsolution" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\Software\Microsoft\Office\16.0\OSM\preventedapplications" /v "projectsolution" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\Software\Microsoft\Office\16.0\OSM\preventedapplications" /v "publishersolution" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\Software\Microsoft\Office\16.0\OSM\preventedapplications" /v "visiosolution" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\Software\Microsoft\Office\16.0\OSM\preventedapplications" /v "wdsolution" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\Software\Microsoft\Office\16.0\OSM\preventedapplications" /v "xlsolution" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\Software\Microsoft\Office\Common\ClientTelemetry" /v "DisableTelemetry" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\Software\Microsoft\Office\16.0\Common" /v "sendcustomerdata" /t REG_DWORD /d "0" /f
Reg.exe add "HKCU\Software\Microsoft\Office\16.0\Common\Feedback" /v "enabled" /t REG_DWORD /d "0" /f
Reg.exe add "HKCU\Software\Microsoft\Office\16.0\Common\Feedback" /v "includescreenshot" /t REG_DWORD /d "0" /f
schtasks /end /tn "\Microsoft\Windows\Customer Experience Improvement Program\UsbCeip" > nul 2>&1 
schtasks /change /tn "\Microsoft\Windows\Customer Experience Improvement Program\UsbCeip" /disable > nul 2>&1
schtasks /end /tn "\Microsoft\Windows\Customer Experience Improvement Program\Uploader" > nul 2>&1
schtasks /change /tn "\Microsoft\Windows\Customer Experience Improvement Program\Uploader" /disable > nul 2>&1
schtasks /end /tn "\Microsoft\Windows\Application Experience\Microsoft Compatibility Appraiser" > nul 2>&1
Reg.exe add "HKCU\Software\Microsoft\Office\16.0\OSM\preventedsolutiontypes" /v "agave" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\Software\Microsoft\Office\16.0\OSM\preventedsolutiontypes" /v "appaddins" /t REG_DWORD /d "1" /f
Reg.exe add "HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Diagnostics\DiagTrack" /v "ShowedToastAtLevel" /t REG_DWORD /d "1" /f
Reg.exe add "HKEY_CURRENT_USER\Software\Microsoft\Input\TIPC" /v "Enabled" /t REG_DWORD /d "0" /f
Reg.exe add "HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\System" /v "UploadUserActivities" /t REG_DWORD /d "0" /f
Reg.exe add "HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\System" /v "PublishUserActivities" /t REG_DWORD /d "0" /f
Reg.exe add "HKEY_CURRENT_USER\Control Panel\International\User Profile" /v "HttpAcceptLanguageOptOut" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\Software\Microsoft\Office\16.0\OSM\preventedsolutiontypes" /v "comaddins" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\Software\Microsoft\Office\16.0\OSM\preventedsolutiontypes" /v "documentfiles" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\Accessibility" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\AppSync" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\BrowserSettings" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\Credentials" /v "Enabled" /t REG_DWORD /d "0" /f
Reg.exe add "HKCU\Software\Microsoft\Office\16.0\OSM\preventedsolutiontypes" /v "templatefiles" /t REG_DWORD /d "1" /f
schtasks /change /tn "\Microsoft\Windows\Application Experience\ProgramDataUpdater" /disable > nul 2>&1
schtasks /end /tn "\Microsoft\Windows\Application Experience\StartupAppTask" > nul 2>&1
schtasks /end /tn "\Microsoft\Windows\Shell\FamilySafetyMonitor" > nul 2>&1
schtasks /change /tn "\Microsoft\Windows\Shell\FamilySafetyMonitor" /disable > nul 2>&1
schtasks /end /tn "\Microsoft\Windows\Shell\FamilySafetyRefresh" > nul 2>&1
schtasks /change /tn "\Microsoft\Windows\Shell\FamilySafetyRefresh" /disable > nul 2>&1
schtasks /end /tn "\Microsoft\Windows\Shell\FamilySafetyUpload" > nul 2>&1
schtasks /change /tn "\Microsoft\Windows\Shell\FamilySafetyUpload" /disable > nul 2>&1
schtasks /end /tn "\Microsoft\Windows\Maintenance\WinSAT" > nul 2>&1
Reg.exe add "HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Search" /v "ConnectedSearchUseWeb" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Search" /v "ConnectedSearchUseWebOverMeteredConnections" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Search" /v "AllowCortana" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Search" /v "AllowCloudSearch" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\Software\Microsoft\Office\16.0\Firstrun" /v "disablemovie" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\Software\Microsoft\Office\16.0\OSM" /v "Enablelogging" /t REG_DWORD /d "0" /f
Reg.exe add "HKCU\Software\Microsoft\Office\16.0\OSM" /v "EnableUpload" /t REG_DWORD /d "0" /f
Reg.exe add "HKCU\Software\Microsoft\Office\16.0\OSM" /v "EnableFileObfuscation" /t REG_DWORD /d "1" /f
Reg.exe add "HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Search" /v "AllowCortanaAboveLock" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Error Reporting" /v "Disabled" /t REG_DWORD /d "1" /f 
Reg.exe add "HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Error Reporting" /v "DoReport" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Error Reporting" /v "LoggingDisabled" /t REG_DWORD /d "1" /f 
Reg.exe add "HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Search" /v "AllowSearchToUseLocation" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Feeds" /v "EnableFeeds" /t REG_DWORD /d "0" /f
Reg.exe add "HKLM\SOFTWARE\Policies\Microsoft" /v "AllowNewsAndInterests" /t REG_DWORD /d "0" /f
Reg.exe add "HKLM\SOFTWARE\Policies\Microsoft\Windows\System" /v "EnableActivityFeed" /t REG_DWORD /d "0" /f
Reg.exe add "HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Search" /v "DisableWebSearch" /t REG_DWORD /d "0" /f 
echo ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════╗
echo ║                                          %s4%WINDOWS TWEAKS DONE SUCCESSFULLY%r%                                ║
echo ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════╝
pause
goto menu

:clean
CLS
echo.
echo %color1%╔═══════════════════════════════════════════════════════════╗
echo %color1%║ %color2% ██████╗██╗     ███████╗ █████╗ ███╗   ██╗███████╗██████╗ %color1%║
echo %color1%║ %color2%██╔════╝██║     ██╔════╝██╔══██╗████╗  ██║██╔════╝██╔══██╗%color1%║
echo %color1%║ %color2%██║     ██║     █████╗  ███████║██╔██╗ ██║█████╗  ██████╔╝%color1%║
echo %color1%║ %color2%██║     ██║     ██╔══╝  ██╔══██║██║╚██╗██║██╔══╝  ██╔══██╗%color1%║
echo %color1%║ %color2%╚██████╗███████╗███████╗██║  ██║██║ ╚████║███████╗██║  ██║%color1%║
echo %color1%║ %color2% ╚═════╝╚══════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝%color1%║
echo %color1%╚═══════════════════════════════════════════════════════════╝%reset%

echo Cleaning System...
del /f /s /q "%temp%\*.*"
for /d %%x in ("%temp%\*") do rd /s /q "%%x"
echo ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════╗
echo ║                      %s4%CLEANING DONE SUCCESSFULLY%r%                                                          ║
echo ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════╝
pause
goto menu

:nvidia_gpu
CLS
echo.
echo %color1%╔════════════════════════════════════════════════════════╗
echo %color1%║ %color2%             ██████╗ ██████╗ ██╗   ██╗                 %color1%║
echo %color1%║ %color2%            ██╔════╝ ██╔══██╗██║   ██║                 %color1%║
echo %color1%║ %color2%            ██║  ███╗██████╔╝██║   ██║                 %color1%║
echo %color1%║ %color2%            ██║   ██║██╔═══╝ ██║   ██║                 %color1%║
echo %color1%║ %color2%            ╚██████╔╝██║     ╚██████╔╝                 %color1%║
echo %color1%║ %color2%             ╚═════╝ ╚═╝      ╚═════╝                  %color1%║
echo %color1%║                                                        %color1%║
echo %color1%║ %color2%████████╗██╗    ██╗███████╗ █████╗ ██╗  ██╗███████╗    %color1%║
echo %color1%║ %color2%╚══██╔══╝██║    ██║██╔════╝██╔══██╗██║ ██╔╝██╔════╝    %color1%║
echo %color1%║ %color2%   ██║   ██║ █╗ ██║█████╗  ███████║█████╔╝ ███████╗    %color1%║
echo %color1%║ %color2%   ██║   ██║███╗██║██╔══╝  ██╔══██║██╔═██╗ ╚════██║    %color1%║
echo %color1%║ %color2%   ██║   ╚███╔███╔╝███████╗██║  ██║██║  ██╗███████║    %color1%║
echo %color1%║ %color2%   ╚═╝    ╚══╝╚══╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝    %color1%║
echo %color1%╚════════════════════════════════════════════════════════╝%reset%
                                                   
echo Applying GPU Tweaks...
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Services\GpuEnergyDrv" /v "Start" /t REG_DWORD /d "4" /f
echo Disabling GpuEnergyDrv
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Services\nvlddmkm" /v "DisablePreemption" /t REG_DWORD /d "1" /f
echo Disabling Preemtion...
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Services\nvlddmkm" /v "DisableCudaContextPreemption" /t REG_DWORD /d "1" /f
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Scheduler" /v "EnablePreemption" /t REG_DWORD /d "0" /f
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Scheduler" /v "PlatformSupportMiracast" /t REG_DWORD /d "0" /f
echo ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════╗
echo ║                      %s4%GPU TWEAKS DONE SUCCESSFULLY%r%                                                        ║
echo ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════╝
pause
goto menu

:high_priority
CLS
echo.
echo %color1%╔══════════════════════════════════════════════════════════╗
echo %color1%║ %color2%            ██╗  ██╗██╗ ██████╗ ██╗  ██╗                 %color1%║
echo %color1%║ %color2%            ██║  ██║██║██╔════╝ ██║  ██║                 %color1%║
echo %color1%║ %color2%            ███████║██║██║  ███╗███████║                 %color1%║
echo %color1%║ %color2%            ██╔══██║██║██║   ██║██╔══██║                 %color1%║
echo %color1%║ %color2%            ██║  ██║██║╚██████╔╝██║  ██║                 %color1%║
echo %color1%║ %color2%            ╚═╝  ╚═╝╚═╝ ╚═════╝ ╚═╝  ╚═╝                 %color1%║
echo %color1%║                                                          %color1%║
echo %color1%║ %color2%██████╗ ██████╗ ██╗ ██████╗ ██████╗ ██╗████████╗██╗   ██╗%color1%║
echo %color1%║ %color2%██╔══██╗██╔══██╗██║██╔═══██╗██╔══██╗██║╚══██╔══╝╚██╗ ██╔╝%color1%║
echo %color1%║ %color2%██████╔╝██████╔╝██║██║   ██║██████╔╝██║   ██║    ╚████╔╝ %color1%║
echo %color1%║ %color2%██╔═══╝ ██╔══██╗██║██║   ██║██╔══██╗██║   ██║     ╚██╔╝  %color1%║
echo %color1%║ %color2%██║     ██║  ██║██║╚██████╔╝██║  ██║██║   ██║      ██║   %color1%║
echo %color1%║ %color2%╚═╝     ╚═╝  ╚═╝╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝   ╚═╝      ╚═╝   %color1%║
echo %color1%╚══════════════════════════════════════════════════════════╝%reset%

echo Setting High Priority for Fortnite...
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\FortniteClient-Win64-Shipping.exe\PerfOptions" /v "CpuPriorityClass" /t REG_DWORD /d "3" /f
echo ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════╗
echo ║                                 %s4%HIGH PRIORITY SET FOR FORTNITE%r%                                           ║
echo ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════╝
pause
goto menu

:mouse_keyboard
CLS
echo.
echo %color1%╔════════════════════════════════════════════════════════╗
echo %color1%║ %color2%            ██╗  ██╗██████╗ ███╗   ███╗                %color1%║
echo %color1%║ %color2%            ██║ ██╔╝██╔══██╗████╗ ████║                %color1%║
echo %color1%║ %color2%            █████╔╝ ██████╔╝██╔████╔██║                %color1%║
echo %color1%║ %color2%            ██╔═██╗ ██╔══██╗██║╚██╔╝██║                %color1%║
echo %color1%║ %color2%            ██║  ██╗██████╔╝██║ ╚═╝ ██║                %color1%║ 
echo %color1%║ %color2%            ╚═╝  ╚═╝╚═════╝ ╚═╝     ╚═╝                %color1%║
echo %color1%║                                                        %color1%║
echo %color1%║ %color2%████████╗██╗    ██╗███████╗ █████╗ ██╗  ██╗███████╗    %color1%║
echo %color1%║ %color2%╚══██╔══╝██║    ██║██╔════╝██╔══██╗██║ ██╔╝██╔════╝    %color1%║
echo %color1%║ %color2%   ██║   ██║ █╗ ██║█████╗  ███████║█████╔╝ ███████╗    %color1%║
echo %color1%║ %color2%   ██║   ██║███╗██║██╔══╝  ██╔══██║██╔═██╗ ╚════██║    %color1%║
echo %color1%║ %color2%   ██║   ╚███╔███╔╝███████╗██║  ██║██║  ██╗███████║    %color1%║
echo %color1%║ %color2%   ╚═╝    ╚══╝╚══╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝    %color1%║
echo %color1%╚════════════════════════════════════════════════════════╝%reset%                                                    
echo Applying Mouse and Keyboard Tweaks...
Reg.exe add "HKCU\Control Panel\Keyboard" /v "KeyboardDelay" /t REG_SZ /d "0" /f
Reg.exe add "HKCU\Control Panel\Keyboard" /v "InitialKeyboardIndicators" /t REG_SZ /d "0" /f
Reg.exe add "HKCU\Control Panel\Keyboard" /v "KeyboardSpeed" /t REG_SZ /d "31" /f
Reg.exe add "HKCU\Control Panel\Accessibility\Keyboard Response" /v "DelayBeforeAcceptance" /t REG_SZ /d "0" /f
Reg.exe add "HKCU\Control Panel\Accessibility\Keyboard Response" /v "Flags" /t REG_SZ /d "0" /f
Reg.exe add "HKCU\Control Panel\Accessibility\Keyboard Response" /v "Last BounceKey Setting" /t REG_DWORD /d "0" /f
Reg.exe add "HKCU\Control Panel\Accessibility\Keyboard Response" /v "Last Valid Delay" /t REG_DWORD /d "0" /f
Reg.exe add "HKCU\Control Panel\Accessibility\Keyboard Response" /v "Last Valid Repeat" /t REG_DWORD /d "0" /f
Reg.exe add "HKCU\Control Panel\Accessibility\Keyboard Response" /v "Last Valid Wait" /t REG_DWORD /d "0" /f
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Services\kbdclass\Parameters" /v "KeyboardDataQueueSize" /t REG_DWORD /d "32" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Input\Settings\ControllerProcessor\CursorSpeed" /v "CursorSensitivity" /t REG_DWORD /d "10000" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Input\Settings\ControllerProcessor\CursorSpeed" /v "CursorUpdateInterval" /t REG_DWORD /d "1" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Input\Settings\ControllerProcessor\CursorSpeed" /v "IRRemoteNavigationDelta" /t REG_DWORD /d "1" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Input\Settings\ControllerProcessor\CursorMagnetism" /v "AttractionRectInsetInDIPS" /t REG_DWORD /d "5" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Input\Settings\ControllerProcessor\CursorMagnetism" /v "DistanceThresholdInDIPS" /t REG_DWORD /d "40" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Input\Settings\ControllerProcessor\CursorMagnetism" /v "MagnetismDelayInMilliseconds" /t REG_DWORD /d "50" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Input\Settings\ControllerProcessor\CursorMagnetism" /v "MagnetismUpdateIntervalInMilliseconds" /t REG_DWORD /d "16" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Input\Settings\ControllerProcessor\CursorMagnetism" /v "VelocityInDIPSPerSecond" /t REG_DWORD /d "360" /f
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Services\mouclass\Parameters" /v "MouseDataQueueSize" /t REG_DWORD /d "32" /f
echo ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════╗
echo ║                      %s4%BEST 0 FREE INPUT DELAY SETTING DONE%r%                                                ║
echo ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════╝
pause
goto menu

:disable_animations
CLS
echo.
echo %color1%╔═══════════════════════════════════════════════════════════════════════════════════╗
echo %color1%║ %color2% █████╗ ███╗   ██╗██╗███╗   ███╗ █████╗ ████████╗██╗ ██████╗ ███╗   ██╗███████╗   %color1%║
echo %color1%║ %color2%██╔══██╗████╗  ██║██║████╗ ████║██╔══██╗╚══██╔══╝██║██╔═══██╗████╗  ██║██╔════╝   %color1%║
echo %color1%║ %color2%███████║██╔██╗ ██║██║██╔████╔██║███████║   ██║   ██║██║   ██║██╔██╗ ██║███████╗   %color1%║
echo %color1%║ %color2%██╔══██║██║╚██╗██║██║██║╚██╔╝██║██╔══██║   ██║   ██║██║   ██║██║╚██╗██║╚════██║   %color1%║
echo %color1%║ %color2%██║  ██║██║ ╚████║██║██║ ╚═╝ ██║██║  ██║   ██║   ██║╚██████╔╝██║ ╚████║███████║   %color1%║
echo %color1%║ %color2%╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝╚═╝     ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝   %color1%║
echo %color1%╚═══════════════════════════════════════════════════════════════════════════════════╝%reset%
echo Disabling Animations...
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects" /v "VisualFXSetting" /t REG_DWORD /d "3" /f
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects\AnimateMinMax" /v "DefaultApplied" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects\ComboBoxAnimation" /v "DefaultApplied" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects\ControlAnimations" /v "DefaultApplied" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects\CursorShadow" /v "DefaultApplied" /t REG_DWORD /d "0" /f
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects\DragFullWindows" /v "DefaultApplied" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects\DropShadow" /v "DefaultApplied" /t REG_DWORD /d "0" /f
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects\DWMAeroPeekEnabled" /v "DefaultApplied" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects\DWMEnabled" /v "DefaultApplied" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects\DWMSaveThumbnailEnabled" /v "DefaultApplied" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects\FontSmoothing" /f
echo ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════╗
echo ║                      %s4%ANIMATIONS DISABLED SUCCESSFULLY%r%                                                    ║
echo ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════╝
pause
goto menu





:cpu_tweaks
CLS
echo.
echo %color1%╔════════════════════════════════════════════════════════╗
echo %color1%║ %color2%             ██████╗██████╗ ██╗   ██╗                  %color1%║
echo %color1%║ %color2%            ██╔════╝██╔══██╗██║   ██║                  %color1%║
echo %color1%║ %color2%            ██║     ██████╔╝██║   ██║                  %color1%║
echo %color1%║ %color2%            ██║     ██╔═══╝ ██║   ██║                  %color1%║
echo %color1%║ %color2%            ╚██████╗██║     ╚██████╔╝                  %color1%║
echo %color1%║ %color2%             ╚═════╝╚═╝      ╚═════╝                   %color1%║
echo %color1%║                                                        %color1%║
echo %color1%║ %color2%████████╗██╗    ██╗███████╗ █████╗ ██╗  ██╗███████╗    %color1%║
echo %color1%║ %color2%╚══██╔══╝██║    ██║██╔════╝██╔══██╗██║ ██╔╝██╔════╝    %color1%║
echo %color1%║ %color2%   ██║   ██║ █╗ ██║█████╗  ███████║█████╔╝ ███████╗    %color1%║
echo %color1%║ %color2%   ██║   ██║███╗██║██╔══╝  ██╔══██║██╔═██╗ ╚════██║    %color1%║
echo %color1%║ %color2%   ██║   ╚███╔███╔╝███████╗██║  ██║██║  ██╗███████║    %color1%║
echo %color1%║ %color2%   ╚═╝    ╚══╝╚══╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝    %color1%║
echo %color1%╚════════════════════════════════════════════════════════╝%reset%
echo Unparking all CPU cores...
powercfg -setacvalueindex scheme_current sub_processor CPMINCORES 100
powercfg /setactive SCHEME_CURRENT
powercfg -setacvalueindex scheme_current sub_processor THROTTLING 0
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\0cc5b647-c1df-4637-891a-dec35c318583" /v "ValueMin" /t REG_DWORD /d "0" /f
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Session Manager\kernel" /v "DisableTsx" /t REG_DWORD /d "0" /f
bcdedit /set {current} numproc %NUMBER_OF_PROCESSORS%
echo ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════╗
echo ║                      %s4%CPU TWEAKS DONE SUCCESSFULLY%r%                                                        ║
echo ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════╝
pause 
goto menu

:usb_tweaks
CLS
echo.
echo %color1%╔════════════════════════════════════════════════════════╗
echo %color1%║ %color2%            ██╗   ██╗███████╗██████╗                   %color1%║
echo %color1%║ %color2%            ██║   ██║██╔════╝██╔══██╗                  %color1%║
echo %color1%║ %color2%            ██║   ██║███████╗██████╔╝                  %color1%║
echo %color1%║ %color2%            ██║   ██║╚════██║██╔══██╗                  %color1%║
echo %color1%║ %color2%            ╚██████╔╝███████║██████╔╝                  %color1%║
echo %color1%║ %color2%             ╚═════╝ ╚══════╝╚═════╝                   %color1%║
echo %color1%║                                                        %color1%║
echo %color1%║ %color2%████████╗██╗    ██╗███████╗ █████╗ ██╗  ██╗███████╗    %color1%║
echo %color1%║ %color2%╚══██╔══╝██║    ██║██╔════╝██╔══██╗██║ ██╔╝██╔════╝    %color1%║
echo %color1%║ %color2%   ██║   ██║ █╗ ██║█████╗  ███████║█████╔╝ ███████╗    %color1%║
echo %color1%║ %color2%   ██║   ██║███╗██║██╔══╝  ██╔══██║██╔═██╗ ╚════██║    %color1%║
echo %color1%║ %color2%   ██║   ╚███╔███╔╝███████╗██║  ██║██║  ██╗███████║    %color1%║
echo %color1%║ %color2%   ╚═╝    ╚══╝╚══╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝    %color1%║
echo %color1%╚════════════════════════════════════════════════════════╝%reset%
for /f %%i in ('wmic path Win32_USBController get PNPDeviceID^| findstr /l "PCI\VEN_"') do (
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Enum\%%i\Device Parameters" /v "AllowIdleIrpInD3" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Enum\%%i\Device Parameters" /v "D3ColdSupported" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Enum\%%i\Device Parameters" /v "DeviceSelectiveSuspended" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Enum\%%i\Device Parameters" /v "EnableSelectiveSuspend" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Enum\%%i\Device Parameters" /v "EnhancedPowerManagementEnabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Enum\%%i\Device Parameters" /v "SelectiveSuspendEnabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Enum\%%i\Device Parameters" /v "SelectiveSuspendOn" /t REG_DWORD /d "0" /f 
)
for /f %%i in ('wmic path Win32_USBController get PNPDeviceID') do set "str=%%i" & (
Reg.exe add "HKLM\System\CurrentControlSet\Enum\%%i\Device Parameters\Interrupt Management\Affinity Policy" /v "DevicePriority" /f
Reg.exe add "HKLM\System\CurrentControlSet\Enum\%%i\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties" /v "MSISupported" /t REG_DWORD /d "1" /f
)
echo ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════╗
echo ║                      %s4%USB TWEAKS DONE SUCCESSFULLY%r%                                                        ║
echo ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════╝
pause
goto menu


:0delay
CLS
echo.
echo %color1%╔══════════════════════════════════════════════════════════╗
echo %color1%║ %color2%    ██████╗     ██████╗ ███████╗██╗      █████╗ ██╗   ██╗%color1%║
echo %color1%║ %color2%   ██╔═████╗    ██╔══██╗██╔════╝██║     ██╔══██╗╚██╗ ██╔╝%color1%║
echo %color1%║ %color2%   ██║██╔██║    ██║  ██║█████╗  ██║     ███████║ ╚████╔╝ %color1%║
echo %color1%║ %color2%   ████╔╝██║    ██║  ██║██╔══╝  ██║     ██╔══██║  ╚██╔╝  %color1%║
echo %color1%║ %color2%   ╚██████╔╝    ██████╔╝███████╗███████╗██║  ██║   ██║   %color1%║
echo %color1%║ %color2%    ╚═════╝     ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝   ╚═╝   %color1%║
echo %color1%║                                                          %color1%║
echo %color1%║ %color2%████████╗██╗    ██╗███████╗ █████╗ ██╗  ██╗███████╗      %color1%║
echo %color1%║ %color2%╚══██╔══╝██║    ██║██╔════╝██╔══██╗██║ ██╔╝██╔════╝      %color1%║
echo %color1%║ %color2%   ██║   ██║ █╗ ██║█████╗  ███████║█████╔╝ ███████╗      %color1%║
echo %color1%║ %color2%   ██║   ██║███╗██║██╔══╝  ██╔══██║██╔═██╗ ╚════██║      %color1%║
echo %color1%║ %color2%   ██║   ╚███╔███╔╝███████╗██║  ██║██║  ██╗███████║      %color1%║
echo %color1%║ %color2%   ╚═╝    ╚══╝╚══╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝      %color1%║
echo %color1%╚══════════════════════════════════════════════════════════╝%reset%
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\csrss.exe\PerfOptions" /v "IoPriority" /t REG_DWORD /d "3" /f
reg.exe add "HKLM\SYSTEM\CurrentControlSet\Enum\%%a\Device Parameters" /v SelectiveSuspendOn /t REG_DWORD /d 0 /f
reg.exe add "HKLM\SYSTEM\CurrentControlSet\Enum\%%a\Device Parameters" /v AllowIdleIrpInD3 /t REG_DWORD /d 0 /f
reg.exe add "HKLM\SYSTEM\CurrentControlSet\Enum\%%a\Device Parameters\WDF" /v IdleInWorkingState /t REG_DWORD /d 0 /f
reg.exe add "HKLM\SYSTEM\CurrentControlSet\Enum\%%s\Device Parameters" /v SelectiveSuspendOn /t REG_DWORD /d 0 /f
reg.exe add "HKLM\SYSTEM\CurrentControlSet\Enum\%%s\Device Parameters" /v AllowIdleIrpInD3 /t REG_DWORD /d 0 /f
reg.exe add "HKLM\SYSTEM\CurrentControlSet\Enum\%%s\Device Parameters\WDF" /v IdleInWorkingState /t REG_DWORD /d 0 /f
reg.exe add "HKEY_LOCAL_MACHINE\System\CurrentControlSet\Enum\%%i\Device Parameters" /v "EnableSelectiveSuspend" /t REG_DWORD /d "0" /f > nul
Reg.exe add "HKLM\System\CurrentControlSet\Enum\%%a\Device Parameters" /v "SelectiveSuspendOn" /t REG_DWORD /d "0" /f
Reg.exe add "HKLM\SYSTEM\ControlSet001\Enum\%%a\Device Parameters\WDF" /v IdleInWorkingState /t REG_DWORD /d 0 /f
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0000" /v "LOWLATENCY" /t REG_DWORD /d "1" /f
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0000" /v "Node3DLowLatency" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\SOFTWARE\Microsoft\Games" /v "FpsAll" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\SOFTWARE\Microsoft\Games" /v "FpsStatusGames" /t REG_DWORD /d "10" /f
Reg.exe add "HKCU\SOFTWARE\Microsoft\Games" /v "FpsStatusGamesAll" /t REG_DWORD /d "4" /f
Reg.exe add "HKCU\SOFTWARE\Microsoft\Games" /v "GameFluidity" /t REG_DWORD /d "1" /f
bcdedit /set Disablingdynamictick yes >nul 2>&1
bcdedit /deletevalue useplatformclock >nul 2>&1
bcdedit /set useplatformtick yes >nul 2>&1
fsutil behavior set memoryusage 2 >nul 2>&1
fsutil behavior set mftzone 4 >nul 2>&1
fsutil behavior set disablelastaccess 1 >nul 2>&1
fsutil behavior set disabledeletenotify 0 >nul 2>&1
fsutil behavior set encryptpagingfile 0 >nul 2>&1
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Low Latency" /v "Affinity" /t REG_DWORD /d "0" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Low Latency" /v "Background Only" /t REG_SZ /d "False" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Low Latency" /v "BackgroundPriority" /t REG_DWORD /d "0" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Low Latency" /v "Clock Rate" /t REG_DWORD /d "10000" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Low Latency" /v "GPU Priority" /t REG_DWORD /d "8" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Low Latency" /v "Priority" /t REG_DWORD /d "2" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Low Latency" /v "Scheduling Category" /t REG_SZ /d "Medium" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Low Latency" /v "SFIO Priority" /t REG_SZ /d "High" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Low Latency" /v "Latency Sensitive" /t REG_SZ /d "True" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games" /v "Affinity" /t REG_DWORD /d "0" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games" /v "Background Only" /t REG_SZ /d "False" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games" /v "BackgroundPriority" /t REG_DWORD /d "0" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games" /v "Clock Rate" /t REG_DWORD /d "10000" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games" /v "GPU Priority" /t REG_DWORD /d "8" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games" /v "Priority" /t REG_DWORD /d "2" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games" /v "Scheduling Category" /t REG_SZ /d "High" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games" /v "SFIO Priority" /t REG_SZ /d "High" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games" /v "Latency Sensitive" /t REG_SZ /d "True" /f
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\PriorityControl" /v "Win32PrioritySeparation" /t REG_DWORD /d "38" /f 
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\PriorityControl" /v "IRQ8Priority" /t REG_DWORD /d "1" /f
Reg.exe add "HKLM\SYSTEM\ControlSet001\Control\PriorityControl" /v "IRQ8Priority" /t REG_DWORD /d "1" /f
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\PriorityControl" /v "IRQ16Priority" /t REG_DWORD /d "2" /f
Reg.exe add "HKLM\SYSTEM\ControlSet001\Control\PriorityControl" /v "IRQ16Priority" /t REG_DWORD /d "2" /f
Reg.exe add "HKCU\Control Panel\Desktop" /v "AutoEndTasks" /t REG_SZ /d "1" /f
Reg.exe add "HKCU\Control Panel\Desktop" /v "HungAppTimeout" /t REG_SZ /d "1000" /f
Reg.exe add "HKCU\Control Panel\Desktop" /v "WaitToKillAppTimeout" /t REG_SZ /d "1000" /f
Reg.exe add "HKCU\Control Panel\Desktop" /v "LowLevelHooksTimeout" /t REG_SZ /d "1000" /f
Reg.exe add "HKCU\Control Panel\Desktop" /v "MenuShowDelay" /t REG_SZ /d "0" /f
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control" /v "WaitToKillServiceTimeout" /t REG_SZ /d "1000" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile" /v "SystemResponsiveness" /t REG_DWORD /d "0" /f
schtasks /end /tn "\Microsoft\Windows\Customer Experience Improvement Program\Consolidator" > nul
schtasks /change /tn "\Microsoft\Windows\Customer Experience Improvement Program\Consolidator" /disable > nul
schtasks /end /tn "\Microsoft\Windows\Customer Experience Improvement Program\BthSQM" > nul
schtasks /change /tn "\Microsoft\Windows\Customer Experience Improvement Program\BthSQM" /disable > nul
schtasks /end /tn "\Microsoft\Windows\Customer Experience Improvement Program\KernelCeipTask" > nul
schtasks /change /tn "\Microsoft\Windows\Customer Experience Improvement Program\KernelCeipTask" /disable > nul
schtasks /end /tn "\Microsoft\Windows\Customer Experience Improvement Program\UsbCeip" > nul
schtasks /change /tn "\Microsoft\Windows\Customer Experience Improvement Program\UsbCeip" /disable > nul
schtasks /end /tn "\Microsoft\Windows\Customer Experience Improvement Program\Uploader" > nul
schtasks /change /tn "\Microsoft\Windows\Customer Experience Improvement Program\Uploader" /disable > nul
schtasks /end /tn "\Microsoft\Windows\Application Experience\Microsoft Compatibility Appraiser" > nul
schtasks /change /tn "\Microsoft\Windows\Application Experience\Microsoft Compatibility Appraiser" /disable > nul
schtasks /end /tn "\Microsoft\Windows\Application Experience\ProgramDataUpdater" > nul
schtasks /change /tn "\Microsoft\Windows\Application Experience\ProgramDataUpdater" /disable > nul
schtasks /end /tn "\Microsoft\Windows\Application Experience\StartupAppTask" > nul
schtasks /end /tn "\Microsoft\Windows\Shell\FamilySafetyMonitor" > nul
schtasks /change /tn "\Microsoft\Windows\Shell\FamilySafetyMonitor" /disable > nul
schtasks /end /tn "\Microsoft\Windows\Shell\FamilySafetyRefresh" > nul
schtasks /change /tn "\Microsoft\Windows\Shell\FamilySafetyRefresh" /disable > nul
schtasks /end /tn "\Microsoft\Windows\Shell\FamilySafetyUpload" > nul
schtasks /change /tn "\Microsoft\Windows\Shell\FamilySafetyUpload" /disable > nul
schtasks /end /tn "\Microsoft\Windows\Maintenance\WinSAT" > nul
schtasks /end /tn "\Microsoft\Windows\Customer Experience Improvement Program\Consolidator" > nul
schtasks /change /tn "\Microsoft\Windows\Customer Experience Improvement Program\Consolidator" /disable > nul
schtasks /end /tn "\Microsoft\Windows\Customer Experience Improvement Program\BthSQM" > nul
schtasks /change /tn "\Microsoft\Windows\Customer Experience Improvement Program\BthSQM" /disable > nul
schtasks /end /tn "\Microsoft\Windows\Customer Experience Improvement Program\KernelCeipTask" > nul
schtasks /change /tn "\Microsoft\Windows\Customer Experience Improvement Program\KernelCeipTask" /disable > nul
schtasks /end /tn "\Microsoft\Windows\Customer Experience Improvement Program\UsbCeip" > nul
schtasks /change /tn "\Microsoft\Windows\Customer Experience Improvement Program\UsbCeip" /disable > nul
schtasks /end /tn "\Microsoft\Windows\Customer Experience Improvement Program\Uploader" > nul
schtasks /change /tn "\Microsoft\Windows\Customer Experience Improvement Program\Uploader" /disable > nul
schtasks /end /tn "\Microsoft\Windows\Application Experience\Microsoft Compatibility Appraiser" > nul
schtasks /change /tn "\Microsoft\Windows\Application Experience\Microsoft Compatibility Appraiser" /disable > nul
schtasks /end /tn "\Microsoft\Windows\Application Experience\ProgramDataUpdater" > nul
schtasks /change /tn "\Microsoft\Windows\Application Experience\ProgramDataUpdater" /disable > nul
schtasks /end /tn "\Microsoft\Windows\Application Experience\StartupAppTask" > nul
schtasks /end /tn "\Microsoft\Windows\Shell\FamilySafetyMonitor" > nul
schtasks /change /tn "\Microsoft\Windows\Shell\FamilySafetyMonitor" /disable > nul
schtasks /end /tn "\Microsoft\Windows\Shell\FamilySafetyRefresh" > nul
schtasks /change /tn "\Microsoft\Windows\Shell\FamilySafetyRefresh" /disable > nul
schtasks /end /tn "\Microsoft\Windows\Shell\FamilySafetyUpload" > nul
schtasks /change /tn "\Microsoft\Windows\Shell\FamilySafetyUpload" /disable > nul
schtasks /end /tn "\Microsoft\Windows\Maintenance\WinSAT" > nul
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\Maintenance" /v "MaintenanceDisabled" /t REG_DWORD /d "1" /f 
timeout /t 1 /nobreak > NUL
timeout /t 1 /nobreak > NUL
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize" /v "EnableTransparency" /t REG_DWORD /d "0" /f
timeout /t 1 /nobreak > NUL
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\PushNotifications" /v "ToastEnabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Notifications\Settings" /v "NOC_GLOBAL_SETTING_ALLOW_NOTIFICATION_SOUND" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Notifications\Settings" /v "NOC_GLOBAL_SETTING_ALLOW_CRITICAL_TOASTS_ABOVE_LOCK" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Notifications\Settings\QuietHours" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Notifications\Settings\windows.immersivecontrolpanel_cw5n1h2txyewy!microsoft.windows.immersivecontrolpanel" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Notifications\Settings\Windows.SystemToast.AutoPlay" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Notifications\Settings\Windows.SystemToast.LowDisk" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Notifications\Settings\Windows.SystemToast.Print.Notification" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Notifications\Settings\Windows.SystemToast.SecurityAndMaintenance" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Notifications\Settings\Windows.SystemToast.WiFiNetworkManager" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Policies\Microsoft\Windows\Explorer" /v "DisableNotificationCenter" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\PushNotifications" /v "ToastEnabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Notifications\Settings" /v "NOC_GLOBAL_SETTING_ALLOW_NOTIFICATION_SOUND" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Notifications\Settings" /v "NOC_GLOBAL_SETTING_ALLOW_CRITICAL_TOASTS_ABOVE_LOCK" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Notifications\Settings\QuietHours" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Notifications\Settings\windows.immersivecontrolpanel_cw5n1h2txyewy!microsoft.windows.immersivecontrolpanel" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Notifications\Settings\Windows.SystemToast.AutoPlay" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Notifications\Settings\Windows.SystemToast.LowDisk" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Notifications\Settings\Windows.SystemToast.Print.Notification" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Notifications\Settings\Windows.SystemToast.SecurityAndMaintenance" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Notifications\Settings\Windows.SystemToast.WiFiNetworkManager" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Policies\Microsoft\Windows\Explorer" /v "DisableNotificationCenter" /t REG_DWORD /d "1" /f
timeout /t 1 /nobreak > NUL
Reg.exe add "HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Feeds" /v "EnableFeeds" /t REG_DWORD /d "0" /f
Reg.exe add "HKLM\SOFTWARE\Policies\Microsoft" /v "AllowNewsAndInterests" /t REG_DWORD /d "0" /f
Reg.exe add "HKLM\SOFTWARE\Policies\Microsoft\Windows\System" /v "EnableActivityFeed" /t REG_DWORD /d "0" /f
Reg.exe add "HKCU\Control Panel\International\User Profile" /v "HttpAcceptLanguageOptOut" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo" /v "Enabled" /t REG_DWORD /d "0" /f
Reg.exe add "HKLM\Software\Policies\Microsoft\Windows\System" /v "EnableActivityFeed" /t REG_DWORD /d "0" /f
timeout /t 1 /nobreak > NUL
Reg.exe add "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" /v "DisallowShaking" /t REG_DWORD /d "1" /f
Reg.exe add "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" /v "EnableBalloonTips" /t REG_DWORD /d "0" /f
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced" /v "ShowSyncProviderNotifications" /t REG_DWORD /d "0" /f
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\userNotificationListener" /v "Value" /t REG_SZ /d "Deny" /f
Reg.exe add "HKLM\Software\Policies\Microsoft\Windows\AdvertisingInfo" /v "DisabledByGroupPolicy" /t REG_DWORD /d "1" /f
timeout /t 1 /nobreak > NUL
Reg.exe add "HKCU\SOFTWARE\Microsoft\GameBar" /v "AllowAutoGameMode" /t REG_DWORD /d "1" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\GameBar" /v "AutoGameModeEnabled" /t REG_DWORD /d "1" /f 
timeout /t 1 /nobreak > NUL
Reg.exe add "HKLM\SOFTWARE\Microsoft\PolicyManager\current\device\System" /v "AllowExperimentation" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SOFTWARE\Microsoft\PolicyManager\default\System\AllowExperimentation" /v "value" /t REG_DWORD /d "0" /f 
timeout /t 1 /nobreak > NUL
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\Accessibility" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\AppSync" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\BrowserSettings" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\Credentials" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\DesktopTheme" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\Language" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\PackageState" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\Personalization" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\StartLayout" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\Windows" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\Accessibility" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\AppSync" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\BrowserSettings" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\Credentials" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\DesktopTheme" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\Language" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\PackageState" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\Personalization" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\StartLayout" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\SettingSync\Groups\Windows" /v "Enabled" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Error Reporting" /v "Disabled" /t REG_DWORD /d "1" /f 
Reg.exe add "HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Error Reporting" /v "DoReport" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Error Reporting" /v "LoggingDisabled" /t REG_DWORD /d "1" /f 
Reg.exe add "HKLM\SOFTWARE\Policies\Microsoft\PCHealth\ErrorReporting" /v "DoReport" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows\Windows Error Reporting" /v "Disabled" /t REG_DWORD /d "1" /f 
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Scheduler" /v "EnablePreemption" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Scheduler" /v "GPUPreemptionLevel" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Scheduler" /v "EnableAsyncMidBufferPreemption" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Scheduler" /v "EnableMidGfxPreemptionVGPU" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Scheduler" /v "EnableMidBufferPreemptionForHighTdrTimeout" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Scheduler" /v "EnableSCGMidBufferPreemption" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Scheduler" /v "PerfAnalyzeMidBufferPreemption" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Scheduler" /v "EnableMidGfxPreemption" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Scheduler" /v "EnableMidBufferPreemption" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Scheduler" /v "EnableCEPreemption" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Scheduler" /v "DisableCudaContextPreemption" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Scheduler" /v "DisablePreemptionOnS3S4" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Scheduler" /v "ComputePreemptionLevel" /t REG_DWORD /d "0" /f 
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Scheduler" /v "DisablePreemption" /t REG_DWORD /d "1" /f 
timeout /t 1 /nobreak > NUL
echo ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════╗      
echo ║                      %s4%0 DELAY TWEAKS DONE SUCCESSFULLY%r%                                                    ║
echo ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════╝
pause
goto menu

:power_tweaks_silent
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Power" /v "CoalescingTimerInterval" /t REG_DWORD /d "0" /f >nul 2>&1
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\75b0ae3f-bce0-45a7-8c89-c9611c25e100" /v "Attributes" /t REG_DWORD /d "2" /f >nul 2>&1
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\75b0ae3f-bce0-45a7-8c89-c9611c25e100" /v "Affinity" /t REG_DWORD /d "0" /f >nul 2>&1
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\75b0ae3f-bce0-45a7-8c89-c9611c25e100" /v "Background Only" /t REG_SZ /d "False" /f >nul 2>&1
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\75b0ae3f-bce0-45a7-8c89-c9611c25e100" /v "Clock Rate" /t REG_DWORD /d "10000" /f >nul 2>&1
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\75b0ae3f-bce0-45a7-8c89-c9611c25e100" /v "GPU Priority" /t REG_DWORD /d "8" /f >nul 2>&1
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\75b0ae3f-bce0-45a7-8c89-c9611c25e100" /v "Priority" /t REG_DWORD /d "6" /f >nul 2>&1
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\75b0ae3f-bce0-45a7-8c89-c9611c25e100" /v "Scheduling Category" /t REG_SZ /d "High" /f >nul 2>&1
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\75b0ae3f-bce0-45a7-8c89-c9611c25e100" /v "SFIO Priority" /t REG_SZ /d "High" /f >nul 2>&1
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\75b0ae3f-bce0-45a7-8c89-c9611c25e100" /v "BackgroundPriority" /t REG_DWORD /d "0" /f >nul 2>&1
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\75b0ae3f-bce0-45a7-8c89-c9611c25e100" /v "Latency Sensitive" /t REG_SZ /d "True" /f >nul 2>&1
Reg.exe add "HKCU\SOFTWARE\Microsoft\GameBar" /v "AllowAutoGameMode" /t REG_DWORD /d "1" /f >nul 2>&1
Reg.exe add "HKCU\SOFTWARE\Microsoft\GameBar" /v "AutoGameModeEnabled" /t REG_DWORD /d "1" /f >nul 2>&1
powercfg -duplicatescheme 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c 22222222-2222-2222-2222-222222222222 >nul 2>&1
powercfg -setactive 22222222-2222-2222-2222-222222222222 >nul 2>&1
powercfg -changename 22222222-2222-2222-2222-222222222222 "RAKHA ULTIMATE POWERPLAN" "Powerplan for Maximum FPS and Zero Latency by Rakha" >nul 2>&1
goto :eof

:optimize_windows_silent
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize" /v "EnableTransparency" /t REG_DWORD /d "0" /f >nul 2>&1
Reg.exe add "HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Search" /v "AllowCortana" /t REG_DWORD /d "0" /f >nul 2>&1
Reg.exe add "HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Search" /v "DisableWebSearch" /t REG_DWORD /d "0" /f >nul 2>&1
goto :eof

:clean_silent
del /f /s /q "%temp%\*.*" >nul 2>&1
goto :eof

:nvidia_gpu_silent
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Services\GpuEnergyDrv" /v "Start" /t REG_DWORD /d "4" /f >nul 2>&1
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Services\nvlddmkm" /v "DisablePreemption" /t REG_DWORD /d "1" /f >nul 2>&1
goto :eof

:mouse_keyboard_silent
Reg.exe add "HKCU\Control Panel\Keyboard" /v "KeyboardDelay" /t REG_SZ /d "0" /f >nul 2>&1
Reg.exe add "HKCU\Control Panel\Keyboard" /v "KeyboardSpeed" /t REG_SZ /d "31" /f >nul 2>&1
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Services\kbdclass\Parameters" /v "KeyboardDataQueueSize" /t REG_DWORD /d "32" /f >nul 2>&1
Reg.exe add "HKLM\SYSTEM\CurrentControlSet\Services\mouclass\Parameters" /v "MouseDataQueueSize" /t REG_DWORD /d "32" /f >nul 2>&1
goto :eof

:high_priority_silent
Reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\FortniteClient-Win64-Shipping.exe\PerfOptions" /v "CpuPriorityClass" /t REG_DWORD /d "3" /f >nul 2>&1
goto :eof

:disable_animations_silent
Reg.exe add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects" /v "VisualFXSetting" /t REG_DWORD /d "3" /f >nul 2>&1
goto :eof

:cpu_tweaks_silent
powercfg -setacvalueindex scheme_current sub_processor CPMINCORES 100 >nul 2>&1
powercfg /setactive SCHEME_CURRENT >nul 2>&1
powercfg -setacvalueindex scheme_current sub_processor THROTTLING 0 >nul 2>&1
goto :eof

:usb_tweaks_silent
goto :eof

:0delay_silent
Reg.exe add "HKCU\SOFTWARE\Microsoft\Games" /v "GameFluidity" /t REG_DWORD /d "1" /f >nul 2>&1
goto :eof
