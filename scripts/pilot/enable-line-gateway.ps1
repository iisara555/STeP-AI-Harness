# Enables LINE Draft Gateway features and registers a compatible provider endpoint in %ProgramData%\STeP\desktop-policy.json.
# Run in PowerShell as Administrator:
#   powershell -ExecutionPolicy Bypass -File enable-line-gateway.ps1 -Name step-line-ai -BaseUrl http://127.0.0.1:11434/v1 -Protocol openai -AllowlistPath C:\ProgramData\STeP\line-allowlist.json
# Turn off:  powershell -ExecutionPolicy Bypass -File enable-line-gateway.ps1 -Off
#Requires -RunAsAdministrator
param(
  [string]$Name = 'step-line-ai',
  [string]$BaseUrl = 'http://127.0.0.1:11434/v1',
  [ValidateSet('openai', 'anthropic')]
  [string]$Protocol = 'openai',
  [string]$AllowlistPath = '',
  [switch]$Off
)
$ErrorActionPreference = 'Stop'

if ($Name -notmatch '^[\w\s.-]{1,120}$') {
  throw "Invalid provider name '$Name'."
}

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

if ($Off) {
  $policy.features | Add-Member -NotePropertyName lineGateway -NotePropertyValue $false -Force
} else {
  $uri = $null
  if (-not [Uri]::TryCreate($BaseUrl, [UriKind]::Absolute, [ref]$uri)) {
    throw "Invalid BaseUrl: $BaseUrl"
  }
  $isLoopbackHttp = $uri.Scheme -eq 'http' -and ($uri.Host -eq '127.0.0.1' -or $uri.Host -eq 'localhost')
  if (($uri.Scheme -ne 'https' -and -not $isLoopbackHttp) -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) {
    throw 'BaseUrl must be https:// (or loopback http://) with no credentials, query string, or fragment.'
  }

  $existingCompatible = @()
  if ($policy.PSObject.Properties['providers'] -and $null -ne $policy.providers -and $policy.providers.PSObject.Properties['compatible'] -and $null -ne $policy.providers.compatible) {
    $existingCompatible = @($policy.providers.compatible)
  }
  $entry = [pscustomobject]@{
    name = $Name
    baseUrl = $BaseUrl
    protocol = $Protocol
  }
  $nextCompatible = @($existingCompatible | Where-Object { $_.name -ne $Name }) + @($entry)

  $policy.features | Add-Member -NotePropertyName lineGateway -NotePropertyValue $true -Force
  $policy.features | Add-Member -NotePropertyName headless -NotePropertyValue $true -Force
  $policy.features | Add-Member -NotePropertyName compatibleProviders -NotePropertyValue $true -Force
  if (-not $policy.PSObject.Properties['providers'] -or $null -eq $policy.providers) {
    $policy | Add-Member -NotePropertyName providers -NotePropertyValue ([pscustomobject]@{}) -Force
  }
  $policy.providers | Add-Member -NotePropertyName compatible -NotePropertyValue ([object[]]$nextCompatible) -Force
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

if ($AllowlistPath -and (Test-Path -LiteralPath $AllowlistPath)) {
  $allowDir = Split-Path -Parent $AllowlistPath
  Lock $allowDir '(OI)(CI)'
  Lock $AllowlistPath ''
  Write-Host "Locked ACL on allowlist: $AllowlistPath"
}

if ($Off) {
  Write-Host "STeP Desktop: features.lineGateway is off ($file)."
} else {
  Write-Host "STeP Desktop: enabled lineGateway, headless, compatibleProviders ($Name -> $BaseUrl) in ($file)."
}
