@echo off
sc config wuauserv start= auto >nul 2>&1
net start wuauserv >nul 2>&1
sc config bits start= auto >nul 2>&1
echo Windows Update & Store Services Reverted.
