
@echo off
echo Deleting Epic Games temporary files...

set TEMP_DIR=%LOCALAPPDATA%\EpicGamesLauncher\Saved\Temp
set TEMP_DIR2=%USERPROFILE%\AppData\Local\EpicGamesLauncher\Saved\Temp

:: Check if the directories exist and delete files
if exist "%TEMP_DIR%" (
    del /q "%TEMP_DIR%\*"
    echo Deleted files from %TEMP_DIR%
) else (
    echo No temporary files found in %TEMP_DIR%
)

if exist "%TEMP_DIR2%" (
    del /q "%TEMP_DIR2%\*"
    echo Deleted files from %TEMP_DIR2%
) else (
    echo No temporary files found in %TEMP_DIR2%
)

pause