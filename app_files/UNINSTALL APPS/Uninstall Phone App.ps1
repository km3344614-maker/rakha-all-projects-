Get-AppxPackage -AllUsers *YourPhone* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*YourPhone*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
