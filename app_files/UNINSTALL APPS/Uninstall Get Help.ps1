Get-AppxPackage -AllUsers *GetHelp* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*GetHelp*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
