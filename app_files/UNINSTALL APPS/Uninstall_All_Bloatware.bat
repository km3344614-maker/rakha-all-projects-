@echo off
title Uninstall All Windows Bloatware
echo Removing all unnecessary Windows apps in background...
powershell -Command "Get-AppxPackage -AllUsers *3d* | Remove-AppxPackage -ErrorAction SilentlyContinue"
powershell -Command "Get-AppxPackage -AllUsers *Bing* | Remove-AppxPackage -ErrorAction SilentlyContinue"
powershell -Command "Get-AppxPackage -AllUsers *Zune* | Remove-AppxPackage -ErrorAction SilentlyContinue"
powershell -Command "Get-AppxPackage -AllUsers *Xbox* | Remove-AppxPackage -ErrorAction SilentlyContinue"
powershell -Command "Get-AppxPackage -AllUsers *People* | Remove-AppxPackage -ErrorAction SilentlyContinue"
powershell -Command "Get-AppxPackage -AllUsers *YourPhone* | Remove-AppxPackage -ErrorAction SilentlyContinue"
powershell -Command "Get-AppxPackage -AllUsers *MixedReality* | Remove-AppxPackage -ErrorAction SilentlyContinue"
powershell -Command "Get-AppxPackage -AllUsers *FeedbackHub* | Remove-AppxPackage -ErrorAction SilentlyContinue"
powershell -Command "Get-AppxPackage -AllUsers *GetHelp* | Remove-AppxPackage -ErrorAction SilentlyContinue"
powershell -Command "Get-AppxPackage -AllUsers *Maps* | Remove-AppxPackage -ErrorAction SilentlyContinue"
echo [OK] All Bloatware uninstalled!
pause
