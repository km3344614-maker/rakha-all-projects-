@echo off
sc config wuauserv start= disabled >nul 2>&1
net stop wuauserv >nul 2>&1
sc config bits start= disabled >nul 2>&1
echo Windows Update & Store Services Disabled.
