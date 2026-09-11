@echo off 
title Rakha Tweaks
color 2 >nul 2>&1
timeout 5 >nul 2>&1
for /f "usebackq" %%i in (`reg query HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces`) do (
Reg.exe add %%i /v "TcpAckFrequency" /d "1" /t REG_DWORD /f >nul 2>&1
Reg.exe add %%i /v "TCPNoDelay" /d "1" /t REG_DWORD /f >nul 2>&1
Reg.exe add %%i /v "TcpDelAckTicks" /d "0" /t REG_DWORD /f >nul 2>&1
)
echo Done!
timeout 5
exit