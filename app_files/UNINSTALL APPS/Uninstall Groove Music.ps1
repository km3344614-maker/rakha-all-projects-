Get-AppxPackage -AllUsers *ZuneMusic* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*ZuneMusic*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
