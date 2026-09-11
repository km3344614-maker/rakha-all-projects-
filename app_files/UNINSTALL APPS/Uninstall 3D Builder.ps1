Get-AppxPackage -AllUsers *3d* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*3d*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
