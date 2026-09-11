@echo off
sc config Spooler start= auto >nul 2>&1
net start Spooler >nul 2>&1
echo Printer Services Reverted.
