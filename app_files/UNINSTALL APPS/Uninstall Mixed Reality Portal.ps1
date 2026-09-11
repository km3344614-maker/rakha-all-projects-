Get-AppxPackage -AllUsers *MixedReality* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*MixedReality*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
