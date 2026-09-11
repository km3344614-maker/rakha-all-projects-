@echo off
sc config TermService start= disabled >nul 2>&1
net stop TermService >nul 2>&1
sc config SessionEnv start= disabled >nul 2>&1
echo Remote Services Disabled.
