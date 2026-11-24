param(
    [Parameter(Mandatory)][string]$Installer,
    [Parameter(Mandatory)][string]$ApplicationDirectory,
    [Parameter(Mandatory)][string]$Report
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$required = $env:STEP_DESKTOP_REQUIRE_TRUSTED_INSTALLERS -eq 'true'
$result = [ordered]@{
    authenticode = 'not checked'
    defender = 'not checked'
    definitionsRefreshed = $false
    definitionsVersion = $null
}

try {
    $installerPath = (Resolve-Path -LiteralPath $Installer).Path
    $appPath = (Resolve-Path -LiteralPath $ApplicationDirectory).Path
    $signature = Get-AuthenticodeSignature -LiteralPath $installerPath
    $result.authenticode = $signature.Status.ToString()

    try {
        $defender = Get-MpComputerStatus
    } catch {
        Write-Warning 'Microsoft Defender Antivirus status is unavailable on this runner.'
        $defender = $null
    }

    if ($defender -and $defender.AMServiceEnabled -and $defender.AntivirusEnabled -and $defender.AMRunningMode -eq 'Normal') {
        try {
            Update-MpSignature
            $result.definitionsRefreshed = $true
        } catch {
            Write-Warning 'Could not refresh Defender definitions. The scan uses the definitions already installed.'
        }
        $defender = Get-MpComputerStatus
        $result.definitionsVersion = $defender.AntivirusSignatureVersion
        $scanner = Join-Path $env:ProgramData "Microsoft\Windows Defender\Platform\$($defender.AMProductVersion)\MpCmdRun.exe"
        if (-not (Test-Path -LiteralPath $scanner -PathType Leaf)) {
            $scanner = Join-Path $env:ProgramFiles 'Windows Defender\MpCmdRun.exe'
        }
        $result.defender = 'failed'
        foreach ($target in @($installerPath, $appPath)) {
            # In custom scans this reports detections without changing the artifact being tested.
            & $scanner -Scan -ScanType 3 -File $target -DisableRemediation
            if ($LASTEXITCODE -ne 0) {
                throw "Defender reported a detection or scan error (exit code $LASTEXITCODE)."
            }
        }
        $result.defender = 'clean'
    } else {
        $result.defender = 'unavailable'
    }

    if ($result.authenticode -notin @('Valid', 'NotSigned')) {
        throw "Invalid installer Authenticode status: $($result.authenticode)"
    }
    if ($required -and ($result.authenticode -ne 'Valid' -or $result.defender -ne 'clean' -or -not $result.definitionsRefreshed)) {
        throw 'Trusted installer checks require valid Authenticode and a clean Defender scan with refreshed definitions.'
    }
} finally {
    $result | ConvertTo-Json | Set-Content -LiteralPath $Report -Encoding utf8
    if ($env:GITHUB_STEP_SUMMARY) {
        @(
            '### Windows installer checks'
            "- Authenticode: $($result.authenticode)"
            "- Microsoft Defender: $($result.defender)"
            "- Definitions refreshed: $($result.definitionsRefreshed)"
            '- SmartScreen reputation and Microsoft Store certification: not tested'
        ) | Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY -Encoding utf8
    }
}
