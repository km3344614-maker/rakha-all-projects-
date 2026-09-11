Get-AppxPackage -AllUsers *XboxGamingOverlay* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*XboxGamingOverlay*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
