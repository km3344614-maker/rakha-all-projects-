Get-AppxPackage -AllUsers *BingSports* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*BingSports*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
