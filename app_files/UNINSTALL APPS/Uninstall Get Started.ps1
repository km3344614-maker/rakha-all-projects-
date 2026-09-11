Get-AppxPackage -AllUsers *Getstarted* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*Getstarted*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
