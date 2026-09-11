Get-AppxPackage -AllUsers *XboxSpeechToTextOverlay* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*XboxSpeechToTextOverlay*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
