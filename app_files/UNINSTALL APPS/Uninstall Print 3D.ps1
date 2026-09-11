Get-AppxPackage -AllUsers *Print3D* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*Print3D*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
