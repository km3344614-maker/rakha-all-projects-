@echo off
sc config TermService start= auto >nul 2>&1
net start TermService >nul 2>&1
sc config SessionEnv start= auto >nul 2>&1
echo Remote Services Reverted.
