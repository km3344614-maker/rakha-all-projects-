@echo off
sc config Spooler start= disabled >nul 2>&1
net stop Spooler >nul 2>&1
echo Printer Services Disabled.
