Get-AppxPackage -AllUsers *MSPaint* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*MSPaint*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
