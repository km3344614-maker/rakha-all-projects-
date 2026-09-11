Get-AppxPackage -AllUsers *windowscommunicationsapps* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*windowscommunicationsapps*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
