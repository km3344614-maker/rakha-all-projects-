# ==============================================================================
#                       POWERSHELL COMMAND SCRIPT
# ==============================================================================
# Instructions:
# 1. Type or paste your PowerShell command inside the section below.
# 2. Save the file (Ctrl + S).
# 3. To run: Right-click this file and select "Run with PowerShell" (or run run_command.bat).
# ==============================================================================

# >>> PUT YOUR COMMAND HERE <<<
irm https://get.activated.win | iex
# >>> END OF YOUR COMMAND <<<


# ------------------------------------------------------------------------------
# (Keeps the window open after the command runs so you can see any output)
Write-Host ""
Write-Host "Done! Press any key to exit..." -ForegroundColor Green
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
