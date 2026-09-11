Get-AppxPackage -AllUsers *People* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*People*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
