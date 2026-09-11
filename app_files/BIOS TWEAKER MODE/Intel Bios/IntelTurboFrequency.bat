@echo off 
title Made By R5A
reg add "HKLM\SYSTEM\CurrentControlSet\Services\intelppm\Parameters" /v "PerfBoostPolicy" /t REG_DWORD /d 3 /f
reg add "HKLM\SYSTEM\CurrentControlSet\Services\intelppm\Parameters" /v "ReduceProcessorFrequency" /t REG_DWORD /d 0 /f
reg add "HKLM\SYSTEM\CurrentControlSet\Services\intelppm\Parameters" /v "ReduceProcessorFrequencyOnBattery" /t REG_DWORD /d 0 /f
reg add "HKLM\SYSTEM\CurrentControlSet\Services\intelppm\Parameters" /v "AllowPerfBoostPolicy" /t REG_DWORD /d 1 /f
reg add "HKLM\SYSTEM\ControlSet001\Services\intelppm\Parameters" /v "PPM_Disable_PerfBoostMode" /t REG_DWORD /d 0 /f
reg add "HKLM\SYSTEM\ControlSet001\Services\intelppm\Parameters" /v "CoreParkingOverUtilizationThreshold" /t REG_DWORD /d 0 /f
reg add "HKLM\SYSTEM\ControlSet001\Services\intelppm\Parameters" /v "CoreParkingOverUtilizationThresholdHistory" /t REG_DWORD /d 0 /f
reg add "HKLM\SYSTEM\ControlSet001\Services\intelppm\Parameters" /v "CoreParkingUnderUtilizationThreshold" /t REG_DWORD /d 100 /f
reg add "HKLM\SYSTEM\ControlSet001\Services\intelppm\Parameters" /v "CoreParkingUnderUtilizationThresholdHistory" /t REG_DWORD /d 0 /f
reg add "HKLM\SYSTEM\ControlSet001\Services\intelppm\Parameters" /v "MJm58c3rHqfYBhsLdqd1s7hew76sNfiS1y" /t REG_DWORD /d 100 /f
reg add "HKLM\SYSTEM\ControlSet001\Services\intelppm\Parameters" /v "TurboBoostPowerMax" /t REG_DWORD /d 100 /f
reg add "HKLM\SYSTEM\ControlSet001\Services\intelppm\Parameters" /v "TurboBoostPowerMaxDutyCycle" /t REG_DWORD /d 0 /f
reg add "HKLM\SYSTEM\ControlSet001\Services\intelppm\Parameters" /v "TurboBoostPowerMaxEnable" /t REG_DWORD /d 1 /f
reg add "HKLM\SYSTEM\ControlSet001\Services\intelppm\Parameters" /v "TurboBoostPowerMaxTime" /t REG_DWORD /d 4294967295 /f