Get-AppxPackage -AllUsers *WindowsFeedbackHub* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*WindowsFeedbackHub*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
