Get-AppxPackage -AllUsers *WindowsMaps* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*WindowsMaps*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
