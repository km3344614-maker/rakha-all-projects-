Get-AppxPackage -AllUsers *WindowsCalculator* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*WindowsCalculator*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
