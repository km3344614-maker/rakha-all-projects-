Get-AppxPackage -AllUsers *Windows.Photos* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*Windows.Photos*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
