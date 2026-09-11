@echo off
sc config WlanSvc start= auto >nul 2>&1
net start WlanSvc >nul 2>&1
echo WiFi Services Reverted.
