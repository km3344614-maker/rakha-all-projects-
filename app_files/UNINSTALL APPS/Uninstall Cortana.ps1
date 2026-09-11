Get-AppxPackage -AllUsers *549981C3F5F10* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*549981C3F5F10*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
