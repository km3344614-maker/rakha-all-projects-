Get-AppxPackage -AllUsers *ScreenSketch* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*ScreenSketch*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
