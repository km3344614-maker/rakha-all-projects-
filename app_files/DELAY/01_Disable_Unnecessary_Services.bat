@echo off
title RAKHA TWEAKS - OP1 Services Optimization
echo Disabling unnecessary background services...

:: SysMain (SuperFetch)
sc config SysMain start= disabled >nul 2>&1
net stop SysMain >nul 2>&1

:: Tablet Input Service
sc config TabletInputService start= disabled >nul 2>&1
net stop TabletInputService >nul 2>&1

:: Windows Biometric Service
sc config WbioSrvc start= disabled >nul 2>&1
net stop WbioSrvc >nul 2>&1

:: Remote Registry
sc config RemoteRegistry start= disabled >nul 2>&1
net stop RemoteRegistry >nul 2>&1

:: SSDP Discovery
sc config SSDPSRV start= disabled >nul 2>&1
net stop SSDPSRV >nul 2>&1

:: Smart Card Services
sc config SCardSvr start= disabled >nul 2>&1
net stop SCardSvr >nul 2>&1

:: IP Helper (IPv6 Tunnel)
sc config iphlpsvc start= disabled >nul 2>&1
net stop iphlpsvc >nul 2>&1

:: Connected User Experiences and Telemetry (DiagTrack)
sc config DiagTrack start= disabled >nul 2>&1
net stop DiagTrack >nul 2>&1
sc config dmwappushservice start= disabled >nul 2>&1
net stop dmwappushservice >nul 2>&1

:: Windows Error Reporting Service
sc config WerSvc start= disabled >nul 2>&1
net stop WerSvc >nul 2>&1

:: Geolocation Service
sc config lfsvc start= disabled >nul 2>&1
net stop lfsvc >nul 2>&1

echo [OK] OP1 Services Disabled Successfully!
