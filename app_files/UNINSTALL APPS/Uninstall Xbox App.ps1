Get-AppxPackage -AllUsers *XboxApp* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*XboxApp*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
