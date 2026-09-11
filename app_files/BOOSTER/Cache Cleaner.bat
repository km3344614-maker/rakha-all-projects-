
@echo off
echo Deleting NVIDIA Cache...

rem Define cache paths
set gpuCachePath=%localappdata%\NVIDIA\GPUCache
set driverCachePath=C:\ProgramData\NVIDIA Corporation\NVCache
set tempPath=C:\Windows\Temp
set localTempPath=%temp%
set shaderCachePath=%localappdata%\Microsoft\DirectX Shader Cache

rem Delete NVIDIA GPU Cache
if exist "%gpuCachePath%" (
    rmdir /s /q "%gpuCachePath%"
    echo Deleted: %gpuCachePath%
) else (
    echo Not found: %gpuCachePath%
)

rem Delete NVIDIA Driver Cache
if exist "%driverCachePath%" (
    rmdir /s /q "%driverCachePath%"
    echo Deleted: %driverCachePath%
) else (
    echo Not found: %driverCachePath%
)

rem Delete Windows Temp Files
if exist "%tempPath%" (
    del /q "%tempPath%\*.*"
    echo Cleared: %tempPath%
) else (
    echo Not found: %tempPath%
)

rem Delete Local Temp Files
if exist "%localTempPath%" (
    del /q "%localTempPath%\*.*"
    echo Cleared: %localTempPath%
) else (
    echo Not found: %localTempPath%
)

rem Delete DirectX Shader Cache
if exist "%shaderCachePath%" (
    rmdir /s /q "%shaderCachePath%"
    echo Deleted: %shaderCachePath%
) else (
    echo Not found: %shaderCachePath%
)

echo Cache cleanup complete.
pause