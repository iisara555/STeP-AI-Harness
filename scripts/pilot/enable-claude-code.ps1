# Turns on "your plan through Claude Code" in STeP Desktop on this computer, for the pilot (docs/claude-subscription.md).
# Run in PowerShell as Administrator:   powershell -ExecutionPolicy Bypass -File enable-claude-code.ps1
# Turn it off again:                    powershell -ExecutionPolicy Bypass -File enable-claude-code.ps1 -Off
# It sets features.claudeSubscription in %ProgramData%\STeP\desktop-policy.json and keeps any other settings there.
# STeP Desktop trusts that file only when Administrators own it and only Administrators and SYSTEM can change it, so
# the folder and file get exactly those permissions (everyone else can read). Restart STeP Desktop afterwards.
#Requires -RunAsAdministrator
param([switch]$Off)
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:ProgramData 'STeP'
$file = Join-Path $dir 'desktop-policy.json'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$policy = [pscustomobject]@{}
if (Test-Path -LiteralPath $file) {
  $text = Get-Content -Raw -LiteralPath $file
  if ($text -and $text.Trim()) { $policy = $text | ConvertFrom-Json }
}
if (-not $policy.PSObject.Properties['features']) {
  $policy | Add-Member -NotePropertyName features -NotePropertyValue ([pscustomobject]@{})
}
$policy.features | Add-Member -NotePropertyName claudeSubscription -NotePropertyValue (-not $Off) -Force
[System.IO.File]::WriteAllText($file, ($policy | ConvertTo-Json -Depth 20), (New-Object System.Text.UTF8Encoding $false))

# Administrators (S-1-5-32-544) own both; Administrators and SYSTEM (S-1-5-18) have full control; Users (S-1-5-32-545) read.
function Lock($path, $inherit) {
  & icacls $path /setowner '*S-1-5-32-544' | Out-Null
  if ($LASTEXITCODE) { throw "icacls /setowner failed on $path" }
  & icacls $path /inheritance:r /grant:r "*S-1-5-32-544:$($inherit)F" "*S-1-5-18:$($inherit)F" "*S-1-5-32-545:$($inherit)RX" | Out-Null
  if ($LASTEXITCODE) { throw "icacls /grant failed on $path" }
}
Lock $dir '(OI)(CI)'
Lock $file ''

$state = if ($Off) { 'off' } else { 'on' }
Write-Host "STeP Desktop: your plan through Claude Code is $state on this computer ($file). Restart STeP Desktop."
