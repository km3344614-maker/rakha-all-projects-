Get-AppxPackage -AllUsers *OneConnect* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*OneConnect*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
