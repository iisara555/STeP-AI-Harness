# Shared Windows runtime bootstrap for STeP AI.
# Node is pinned so employee installs are reproducible and do not trust a moving latest target.
# CI verifies these pinned hashes against Node.js signed SHASUMS.

$StepNodeVersion = "22.23.2"
$StepNodeDist = "https://nodejs.org/dist/v$StepNodeVersion"
$StepNodeSha256 = @{
    "x64"   = "1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97"
    "arm64" = "fec025a6da31757e3b6af84c5a1628e9d38442ca99a2161091d78f2fcfa35ef3"
}

function Test-StepNodeUsable {
    param([string]$Candidate)
    if (-not $Candidate -or -not (Test-Path $Candidate)) { return $false }
    try {
        $major = & $Candidate -p "Number(process.versions.node.split('.')[0])" 2>$null
        return ([int]$major -ge 20)
    } catch {
        return $false
    }
}

function Get-StepWindowsArch {
    $arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    switch ($arch.ToUpperInvariant()) {
        "AMD64" { return "x64" }
        "ARM64" { return "arm64" }
        default { throw "ไม่รองรับสถาปัตยกรรม Windows นี้: $arch" }
    }
}

function Find-StepNode {
    param([string]$RootDir)

    $localNode = Join-Path $RootDir ".step-ai\runtime\node\node.exe"
    if (Test-StepNodeUsable $localNode) { return $localNode }

    $systemNode = Get-Command node -ErrorAction SilentlyContinue
    if ($systemNode -and (Test-StepNodeUsable $systemNode.Source)) { return $systemNode.Source }

    return $null
}

function Bootstrap-StepNode {
    param([string]$RootDir)

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $arch = Get-StepWindowsArch
    $expectedHash = $StepNodeSha256[$arch]
    $nodeFile = "node-v$StepNodeVersion-win-$arch.zip"
    $url = "$StepNodeDist/$nodeFile"

    $runtimeParent = Join-Path $RootDir ".step-ai\runtime"
    $runtimeDir = Join-Path $runtimeParent "node"
    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("step-ai-node-" + [guid]::NewGuid().ToString("N"))
    $archive = Join-Path $tempRoot $nodeFile
    $extractDir = Join-Path $tempRoot "extract"

    New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
    New-Item -ItemType Directory -Force -Path $extractDir | Out-Null

    try {
        Write-Host "กำลังเตรียม Node.js v$StepNodeVersion สำหรับ STeP AI (ติดตั้งเฉพาะในโฟลเดอร์นี้)..." -ForegroundColor Gray
        Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $archive -TimeoutSec 180

        $actualHash = (Get-FileHash -Path $archive -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualHash -ne $expectedHash) {
            throw "SHA-256 ของ Node.js ไม่ตรงกับค่าที่ STeP AI pin ไว้"
        }

        Expand-Archive -Path $archive -DestinationPath $extractDir -Force
        $extractedDir = Join-Path $extractDir ("node-v{0}-win-{1}" -f $StepNodeVersion, $arch)
        $nodeExe = Join-Path $extractedDir "node.exe"
        if (-not (Test-StepNodeUsable $nodeExe)) {
            throw "Node.js Runtime ที่ดาวน์โหลดมาไม่สมบูรณ์"
        }

        New-Item -ItemType Directory -Force -Path $runtimeParent | Out-Null
        $runtimeNew = Join-Path $runtimeParent "node.new"
        Remove-Item -Recurse -Force $runtimeNew -ErrorAction SilentlyContinue
        Move-Item -Path $extractedDir -Destination $runtimeNew
        Remove-Item -Recurse -Force $runtimeDir -ErrorAction SilentlyContinue
        Move-Item -Path $runtimeNew -Destination $runtimeDir

        $resolved = Join-Path $runtimeDir "node.exe"
        Write-Host "✓ เตรียม Node.js Runtime สำเร็จ: $(& $resolved -v)" -ForegroundColor Green
        return $resolved
    } finally {
        Remove-Item -Recurse -Force $tempRoot -ErrorAction SilentlyContinue
    }
}

function Resolve-StepNode {
    param([string]$RootDir)

    $existing = Find-StepNode -RootDir $RootDir
    if ($existing) { return $existing }
    return Bootstrap-StepNode -RootDir $RootDir
}
