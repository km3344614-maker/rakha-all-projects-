Get-AppxPackage -AllUsers *ZuneVideo* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*ZuneVideo*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
