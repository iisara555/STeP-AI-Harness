# Approves or removes an administrator-reviewed Skill Pack digest in %ProgramData%\STeP\desktop-policy.json.
# Run in PowerShell as Administrator:
#   powershell -ExecutionPolicy Bypass -File enable-skill-pack.ps1 -Digest <64-hex-sha256>
# Remove digest:  powershell -ExecutionPolicy Bypass -File enable-skill-pack.ps1 -Digest <64-hex> -Remove
# Turn feature off: powershell -ExecutionPolicy Bypass -File enable-skill-pack.ps1 -Off
#Requires -RunAsAdministrator
param(
  [string]$Digest = '',
  [switch]$Remove,
  [switch]$Off
)
$ErrorActionPreference = 'Stop'

$dir = Join-Path $env:ProgramData 'STeP'
$file = Join-Path $dir 'desktop-policy.json'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$policy = [pscustomobject]@{}
if (Test-Path -LiteralPath $file) {
  $text = Get-Content -Raw -LiteralPath $file
  if ($text -and $text.Trim()) { $policy = $text | ConvertFrom-Json }
}
if (-not $policy.PSObject.Properties['features'] -or $null -eq $policy.features) {
  $policy | Add-Member -NotePropertyName features -NotePropertyValue ([pscustomobject]@{}) -Force
}

$existingDigests = @()
if ($policy.PSObject.Properties['skillPacks'] -and $null -ne $policy.skillPacks -and $policy.skillPacks.PSObject.Properties['approvedDigests'] -and $null -ne $policy.skillPacks.approvedDigests) {
  $existingDigests = @($policy.skillPacks.approvedDigests)
}

if ($Off) {
  $policy.features | Add-Member -NotePropertyName skillPacks -NotePropertyValue $false -Force
}

if ($Remove) {
  if ($Digest -notmatch '^[a-f0-9]{64}$') {
    throw 'Parameter -Digest must be a 64-character lowercase SHA-256 hex string.'
  }
  $filtered = @($existingDigests | Where-Object { $_ -ne $Digest })
  if (-not $policy.PSObject.Properties['skillPacks'] -or $null -eq $policy.skillPacks) {
    $policy | Add-Member -NotePropertyName skillPacks -NotePropertyValue ([pscustomobject]@{}) -Force
  }
  $policy.skillPacks | Add-Member -NotePropertyName approvedDigests -NotePropertyValue ([string[]]$filtered) -Force
} elseif (-not $Off) {
  if ($Digest -notmatch '^[a-f0-9]{64}$') {
    throw 'Parameter -Digest must be a 64-character lowercase SHA-256 hex string.'
  }
  $next = @($existingDigests | Where-Object { $_ -ne $Digest }) + @($Digest)
  if ($next.Count -gt 100) {
    throw 'approvedDigests exceeds maximum of 100 entries.'
  }
  $policy.features | Add-Member -NotePropertyName skillPacks -NotePropertyValue $true -Force
  if (-not $policy.PSObject.Properties['skillPacks'] -or $null -eq $policy.skillPacks) {
    $policy | Add-Member -NotePropertyName skillPacks -NotePropertyValue ([pscustomobject]@{}) -Force
  }
  $policy.skillPacks | Add-Member -NotePropertyName approvedDigests -NotePropertyValue ([string[]]$next) -Force
}

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

if ($Off) {
  Write-Host "STeP Desktop: features.skillPacks is off ($file). Restart STeP Desktop."
} elseif ($Remove) {
  Write-Host "STeP Desktop: removed approved Skill Pack digest $Digest ($file). Restart STeP Desktop."
} else {
  Write-Host "STeP Desktop: approved Skill Pack digest $Digest and enabled features.skillPacks ($file). Restart STeP Desktop."
}
