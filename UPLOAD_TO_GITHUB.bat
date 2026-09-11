@echo off
title RAKHA - Upload to GitHub
color 0A
cd /d C:\Users\RAKHA\Desktop\RAKHAS TWEAKS PROJECT\LUNCH

echo ========================================================
echo   RAKHA CLOUD - UPLOADING ALL FILES TO GITHUB
echo ========================================================
echo.
echo [Option 1] Press [ENTER] to login via Browser.
echo [Option 2] Or paste your GitHub Token below and press Enter.
echo.
set TOKEN=
set /p TOKEN=Paste Token here (or press Enter): 

if defined TOKEN (
    echo Pushing using Personal Access Token...
    git remote set-url origin https://%TOKEN%@github.com/km3344614-maker/rakha-all-projects-.git
) else (
    git remote set-url origin https://github.com/km3344614-maker/rakha-all-projects-.git
)

echo.
echo Pushing files to GitHub...
git branch -M main
git push -u origin main --force
echo.
if %ERRORLEVEL% equ 0 (
    echo ========================================================
    echo   SUCCESS! All files uploaded to GitHub successfully!
    echo ========================================================
) else (
    echo ========================================================
    echo   Upload failed or requires authorization.
    echo ========================================================
)
echo.
pause
