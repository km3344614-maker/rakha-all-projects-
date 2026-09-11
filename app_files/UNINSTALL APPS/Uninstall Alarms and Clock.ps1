Get-AppxPackage -AllUsers *WindowsAlarms* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*WindowsAlarms*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
