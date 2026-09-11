Get-AppxPackage -AllUsers *Messaging* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*Messaging*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
