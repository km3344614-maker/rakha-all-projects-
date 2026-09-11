Get-AppxPackage -AllUsers *WebpImageExtension* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*WebpImageExtension*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
