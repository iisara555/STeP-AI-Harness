# GitHub's disposable Windows runner only. No test certificate or test-signed package is uploaded.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
    throw 'Run this installation smoke on a disposable GitHub-hosted runner.'
}
$package = (Resolve-Path $env:STEP_MSIX_PACKAGE).Path
$signtool = Join-Path $env:STEP_MSIX_KIT 'x64\SignTool.exe'
[xml]$manifest = Get-Content 'release/msix-stage/win-unpacked/AppxManifest.xml' -Raw
$identity = $manifest.Package.Identity

$reports = (New-Item 'release/msix-verification' -ItemType Directory -Force).FullName
Start-Transcript -Path "$reports\installation.log" | Out-Null
$temp = (New-Item (Join-Path $env:RUNNER_TEMP "step-msix-$([guid]::NewGuid())") -ItemType Directory).FullName
$testPackage = Join-Path $temp 'STeP-Desktop-Test.msix'
$cert = $null
$installed = $null
$appProcess = $null
try {
    node test/msix-smoke.mjs legacy
    if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the legacy Desktop profile.' }

    Copy-Item $package $testPackage
    $cert = New-SelfSignedCertificate -Subject $identity.Publisher -Type CodeSigningCert -HashAlgorithm SHA256 `
        -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddDays(1)
    $publicCert = Join-Path $temp 'test.cer'
    Export-Certificate -Cert $cert -FilePath $publicCert | Out-Null
    Import-Certificate -FilePath $publicCert -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople' | Out-Null
    & $signtool sign /fd SHA256 /sha1 $cert.Thumbprint $testPackage
    if ($LASTEXITCODE -ne 0) { throw 'Test package signing failed.' }
    Add-AppxPackage -Path $testPackage
    $installed = Get-AppxPackage -Name $identity.Name
    if (!$installed -or $installed.Version.ToString() -ne $identity.Version) { throw 'The expected MSIX version was not installed.' }
    Write-Host "Installed $($installed.PackageFullName)"

    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("2E941141-7F97-4756-BA1D-9DECDE894A3D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IActivationManager {
    void ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string appId,
        [MarshalAs(UnmanagedType.LPWStr)] string arguments, uint options, out uint processId);
}
public static class PackageActivation {
    public static uint Start(string appId, string arguments) {
        var manager = (IActivationManager)Activator.CreateInstance(
            Type.GetTypeFromCLSID(new Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")));
        try {
            uint id;
            manager.ActivateApplication(appId, arguments, 0, out id);
            return id;
        } finally {
            Marshal.ReleaseComObject(manager);
        }
    }
}
'@
    $appId = "$($installed.PackageFamilyName)!$($manifest.Package.Applications.Application.Id)"
    $port = Get-Random -Minimum 41000 -Maximum 49000
    $appProcess = [PackageActivation]::Start($appId, "--remote-debugging-port=$port")
    try {
        node test/msix-smoke.mjs msix $port
        if ($LASTEXITCODE -ne 0) { throw 'Installed MSIX workspace smoke failed.' }
    } finally {
        Stop-Process -Id $appProcess -ErrorAction SilentlyContinue
    }

    $kit = "${env:ProgramFiles(x86)}\Windows Kits\10\App Certification Kit"
    $appcert = Join-Path $kit 'appcert.exe'
    if (!(Test-Path $appcert)) {
        'Windows App Certification Kit is unavailable on this runner.' | Set-Content "$reports\certification-status.txt"
        Write-Warning 'Windows App Certification Kit is unavailable. Run it on a Windows client before Store submission.'
    } else {
        Push-Location $kit
        try {
            $reset = Start-Process $appcert -ArgumentList 'reset' -Wait -PassThru
            if ($reset.ExitCode -ne 0) { throw "Windows App Certification Kit reset failed ($($reset.ExitCode))." }
            $result = Start-Process $appcert -ArgumentList "test -packagefullname $($installed.PackageFullName) -reportoutputpath `"$reports\certification.xml`"" -Wait -PassThru
            if ($result.ExitCode -ne 0 -or !(Test-Path "$reports\certification.xml")) {
                throw "Windows App Certification Kit did not pass ($($result.ExitCode)). See the verification artifact."
            }
            [xml]$report = Get-Content "$reports\certification.xml" -Raw
            $summary = $report.SelectSingleNode('//*[@OVERALL_RESULT]')
            if (!$summary -or $summary.OVERALL_RESULT -notin @('PASS', 'WARNING') -or $summary.PARTIAL_RUN -eq 'TRUE') {
                throw 'Windows App Certification Kit did not report a complete pass. See the verification artifact.'
            }
            Write-Host "Windows App Certification Kit result: $($summary.OVERALL_RESULT)"
        } finally {
            Pop-Location
        }
    }
} finally {
    if ($installed) { Remove-AppxPackage -Package $installed.PackageFullName -ErrorAction Continue }
    if ($cert) {
        Remove-Item "Cert:\LocalMachine\TrustedPeople\$($cert.Thumbprint)" -ErrorAction SilentlyContinue
        Remove-Item "Cert:\CurrentUser\My\$($cert.Thumbprint)" -ErrorAction SilentlyContinue
    }
    Remove-Item $temp -Force -Recurse -ErrorAction SilentlyContinue
    Stop-Transcript | Out-Null
}
