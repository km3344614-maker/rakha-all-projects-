@echo off
sc config WlanSvc start= disabled >nul 2>&1
net stop WlanSvc >nul 2>&1
echo WiFi Services Disabled (Ethernet Only).
