Get-AppxPackage -AllUsers *BingFinance* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*BingFinance*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
