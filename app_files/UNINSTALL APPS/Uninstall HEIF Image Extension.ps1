Get-AppxPackage -AllUsers *HEIFImageExtension* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*HEIFImageExtension*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
