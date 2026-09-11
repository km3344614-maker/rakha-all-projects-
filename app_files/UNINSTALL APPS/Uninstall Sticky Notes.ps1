Get-AppxPackage -AllUsers *MicrosoftStickyNotes* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*MicrosoftStickyNotes*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
