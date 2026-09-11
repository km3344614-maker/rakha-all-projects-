@echo off 
title Made By R5A
reg add "HKLM\SYSTEM\ControlSet001\Services\AmdPPM\Parameters" /v "PPM_Disable_PerfBoostMode" /t REG_DWORD /d 0 /f
reg add "HKLM\SYSTEM\ControlSet001\Services\AmdPPM\Parameters" /v "CoreParkingOverUtilizationThreshold" /t REG_DWORD /d 0 /f
reg add "HKLM\SYSTEM\ControlSet001\Services\AmdPPM\Parameters" /v "CoreParkingOverUtilizationThresholdHistory" /t REG_DWORD /d 0 /f
reg add "HKLM\SYSTEM\ControlSet001\Services\AmdPPM\Parameters" /v "CoreParkingUnderUtilizationThreshold" /t REG_DWORD /d 100 /f
reg add "HKLM\SYSTEM\ControlSet001\Services\AmdPPM\Parameters" /v "CoreParkingUnderUtilizationThresholdHistory" /t REG_DWORD /d 0 /f
reg add "HKLM\SYSTEM\ControlSet001\Services\AmdPPM\Parameters" /v "MJm58c3rHqfYBhsLdqd1s7hew76sNfiS1y" /t REG_DWORD /d 100 /f
reg add "HKLM\SYSTEM\ControlSet001\Services\AmdPPM\Parameters" /v "TurboBoostPowerMax" /t REG_DWORD /d 100 /f
reg add "HKLM\SYSTEM\ControlSet001\Services\AmdPPM\Parameters" /v "TurboBoostPowerMaxDutyCycle" /t REG_DWORD /d 0 /f
reg add "HKLM\SYSTEM\ControlSet001\Services\AmdPPM\Parameters" /v "TurboBoostPowerMaxEnable" /t REG_DWORD /d 1 /f
reg add "HKLM\SYSTEM\ControlSet001\Services\AmdPPM\Parameters" /v "TurboBoostPowerMaxTime" /t REG_DWORD /d 4294967295 /f
