# Run from desktop/ after electron-builder --win --x64 --dir.
param(
    [switch]$StoreSubmission
)
$ErrorActionPreference = 'Stop'

$sdk = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Directory |
    Where-Object { $_.Name -match '^10\.0\.\d+\.0$' -and (Test-Path "$($_.FullName)\x64\MakeAppx.exe") } |
    Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
if (!$sdk) { throw 'Windows SDK with MakeAppx is required.' }

if ($StoreSubmission) {
    $identity = $env:STEP_MSIX_IDENTITY_NAME
    $publisher = $env:STEP_MSIX_PUBLISHER
    $publisherDisplayName = $env:STEP_MSIX_PUBLISHER_DISPLAY_NAME
    if ($identity -notmatch '^[a-zA-Z0-9.\-]{3,50}$' -or
        [string]::IsNullOrWhiteSpace($publisher) -or [string]::IsNullOrWhiteSpace($publisherDisplayName)) {
        throw 'Set STEP_MSIX_IDENTITY_NAME, STEP_MSIX_PUBLISHER and STEP_MSIX_PUBLISHER_DISPLAY_NAME from Partner Center.'
    }
} else {
    $identity = 'STePDesktop.Test'
    $publisher = 'CN=STeP Desktop CI Test'
    $publisherDisplayName = 'STeP Desktop CI Test'
}

$app = Get-Content package.json -Raw | ConvertFrom-Json
if ($app.version -notmatch '^\d+\.\d+\.\d+$') { throw 'MSIX requires a stable Desktop version.' }
$major, $minor, $patch = $app.version.Split('.') | ForEach-Object { [int]$_ }
$major++
if (($major, $minor, $patch | Measure-Object -Maximum).Maximum -gt 65535) { throw 'MSIX package version is out of range.' }
$version = "$major.$minor.$patch.0"
$stage = (Resolve-Path 'release/msix-stage/win-unpacked').Path
$displayName = [Security.SecurityElement]::Escape($app.build.productName)
$description = [Security.SecurityElement]::Escape($app.description)
if (!(Test-Path (Join-Path $stage "$($app.build.productName).exe") -PathType Leaf)) {
    throw 'Expected STeP Desktop executable in the staged Windows build.'
}
$assets = New-Item (Join-Path $stage 'Assets') -ItemType Directory -Force
Add-Type -AssemblyName System.Drawing
$icon = [Drawing.Image]::FromFile((Resolve-Path 'build/icon.png').Path)
try {
    foreach ($logo in @{ StoreLogo = 50; Square150x150Logo = 150; Square44x44Logo = 44 }.GetEnumerator()) {
        $image = [Drawing.Bitmap]::new($logo.Value, $logo.Value)
        $graphics = [Drawing.Graphics]::FromImage($image)
        try {
            $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.DrawImage($icon, 0, 0, $logo.Value, $logo.Value)
            $image.Save((Join-Path $assets.FullName "$($logo.Key).png"), [Drawing.Imaging.ImageFormat]::Png)
        } finally {
            $graphics.Dispose()
            $image.Dispose()
        }
    }
} finally {
    $icon.Dispose()
}

$publisherXml = [Security.SecurityElement]::Escape($publisher)
$publisherDisplayNameXml = [Security.SecurityElement]::Escape($publisherDisplayName)
$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
         xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
         xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
         xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
         IgnorableNamespaces="uap uap10 rescap">
  <Identity Name="$identity" Publisher="$publisherXml" Version="$version" ProcessorArchitecture="x64"/>
  <Properties>
    <DisplayName>$displayName</DisplayName>
    <PublisherDisplayName>$publisherDisplayNameXml</PublisherDisplayName>
    <Description>$description</Description>
    <Logo>Assets\StoreLogo.png</Logo>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="$($sdk.Name)"/>
  </Dependencies>
  <Resources>
    <Resource Language="th-TH"/>
    <Resource Language="en-US"/>
  </Resources>
  <Applications>
    <Application Id="STePDesktop" Executable="$displayName.exe" uap10:RuntimeBehavior="packagedClassicApp" uap10:TrustLevel="mediumIL">
      <uap:VisualElements DisplayName="$displayName" Description="$description" BackgroundColor="transparent"
         Square44x44Logo="Assets\Square44x44Logo.png" Square150x150Logo="Assets\Square150x150Logo.png"/>
    </Application>
  </Applications>
  <Capabilities>
    <rescap:Capability Name="runFullTrust"/>
  </Capabilities>
</Package>
"@
[IO.File]::WriteAllText((Join-Path $stage 'AppxManifest.xml'), $manifest)
$packageDir = New-Item 'release/msix-output' -ItemType Directory -Force
$kind = if ($StoreSubmission) { 'Store' } else { 'Preview' }
$package = Join-Path $packageDir.FullName "STeP-Desktop-$kind-$($app.version)-x64.msix"
& "$($sdk.FullName)\x64\MakeAppx.exe" pack /o /h SHA256 /d $stage /p $package
if ($LASTEXITCODE -ne 0) { throw "MakeAppx failed with exit code $LASTEXITCODE" }
$hash = (Get-FileHash $package -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $(Split-Path $package -Leaf)" | Set-Content "$package.sha256" -Encoding Ascii
if ($env:GITHUB_OUTPUT) {
    "package=$package", "kit=$($sdk.FullName)", "kind=$kind" | Out-File $env:GITHUB_OUTPUT -Encoding utf8 -Append
}
