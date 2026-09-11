Get-AppxPackage -AllUsers *WebMediaExtensions* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*WebMediaExtensions*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
