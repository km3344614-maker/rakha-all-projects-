Get-AppxPackage -AllUsers *WindowsSoundRecorder* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*WindowsSoundRecorder*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
