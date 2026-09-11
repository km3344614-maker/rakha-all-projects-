Get-AppxPackage -AllUsers *WindowsCamera* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*WindowsCamera*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
