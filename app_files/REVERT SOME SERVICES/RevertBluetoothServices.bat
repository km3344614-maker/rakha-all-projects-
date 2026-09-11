@echo off
sc config bthserv start= auto >nul 2>&1
net start bthserv >nul 2>&1
sc config BTAGService start= auto >nul 2>&1
echo Bluetooth Services Reverted.
