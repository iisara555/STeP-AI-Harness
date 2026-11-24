# Configures an administrator-approved HTTP MCP server in %ProgramData%\STeP\desktop-policy.json.
# Run in PowerShell as Administrator:
#   $env:STEP_MCP_AUTH_TOKEN = '<token>'
#   powershell -ExecutionPolicy Bypass -File configure-mcp.ps1 -Name step-org -Url https://mcp.step.internal/mcp
# Remove server:  powershell -ExecutionPolicy Bypass -File configure-mcp.ps1 -Name step-org -Remove
# Turn MCP off:   powershell -ExecutionPolicy Bypass -File configure-mcp.ps1 -Off
#Requires -RunAsAdministrator
param(
  [string]$Name = 'step-org',
  [string]$Url = '',
  [string]$TokenEnv = 'STEP_MCP_AUTH_TOKEN',
  [switch]$Remove,
  [switch]$Off
)
$ErrorActionPreference = 'Stop'

if ($Name -notmatch '^[\w-]{1,60}$') {
  throw "Invalid server name '$Name'. Use 1-60 letters, digits, '_' or '-'."
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

$existingServers = @()
if ($policy.PSObject.Properties['mcpServers'] -and $null -ne $policy.mcpServers) {
  $existingServers = @($policy.mcpServers)
}

if ($Off) {
  $policy.features | Add-Member -NotePropertyName mcp -NotePropertyValue $false -Force
}

if ($Remove) {
  $filtered = @($existingServers | Where-Object { $_.name -ne $Name })
  $policy | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([object[]]$filtered) -Force
} elseif (-not $Off) {
  if (-not $Url) {
    throw 'Parameter -Url is required when configuring an MCP server.'
  }
  $uri = $null
  if (-not [Uri]::TryCreate($Url, [UriKind]::Absolute, [ref]$uri)) {
    throw "Invalid URL: $Url"
  }
  $isLoopbackHttp = $uri.Scheme -eq 'http' -and ($uri.Host -eq '127.0.0.1' -or $uri.Host -eq 'localhost')
  if (($uri.Scheme -ne 'https' -and -not $isLoopbackHttp) -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) {
    throw 'MCP server URL must be https:// (or loopback http://) with no credentials, query string, or fragment.'
  }

  $token = [Environment]::GetEnvironmentVariable($TokenEnv)
  if (-not $token) {
    $sec = Read-Host "Enter Bearer token for '$Name' (leave blank for none)" -AsSecureString
    if ($sec.Length -gt 0) {
      $token = [System.Net.NetworkCredential]::new('', $sec).Password
    }
  }
  $headersObj = [pscustomobject]@{}
  if ($token) {
    $headersObj | Add-Member -NotePropertyName Authorization -NotePropertyValue ("Bearer " + $token) -Force
  }

  $entry = [pscustomobject]@{
    name = $Name
    transport = 'http'
    url = $Url
    headers = $headersObj
  }
  $nextServers = @($existingServers | Where-Object { $_.name -ne $Name }) + @($entry)
  $policy.features | Add-Member -NotePropertyName mcp -NotePropertyValue $true -Force
  $policy | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([object[]]$nextServers) -Force
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
  Write-Host "STeP Desktop: features.mcp is off ($file). Restart STeP Desktop."
} elseif ($Remove) {
  Write-Host "STeP Desktop: removed MCP server '$Name' from ($file). Restart STeP Desktop."
} else {
  Write-Host "STeP Desktop: configured MCP server '$Name' ($Url) and enabled features.mcp ($file). Restart STeP Desktop."
}
