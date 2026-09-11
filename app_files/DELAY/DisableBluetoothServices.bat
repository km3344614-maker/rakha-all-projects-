@echo off
sc config bthserv start= disabled >nul 2>&1
net stop bthserv >nul 2>&1
sc config BTAGService start= disabled >nul 2>&1
echo Bluetooth Services Disabled.
