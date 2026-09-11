Get-AppxPackage -AllUsers *MixedReality.Portal* | Remove-AppxPackage -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object { $_.PackageName -like '*MixedReality.Portal*' } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
