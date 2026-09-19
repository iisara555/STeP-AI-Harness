# STeP AI — Zero-Terminal Windows Updater
# อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-not $PSScriptRoot) {
    $PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}

$rootDir = (Resolve-Path "$PSScriptRoot\..").Path
. (Join-Path $PSScriptRoot "windows-runtime.ps1")
$nodeBin = Resolve-StepNode -RootDir $rootDir

$packagePath = Join-Path $rootDir "package.json"
$currentPackage = Get-Content -Raw $packagePath | ConvertFrom-Json
$currentVersionText = [string]$currentPackage.version
$currentVersion = [version]$currentVersionText
$repo = "iisara555/STeP-AI-Harness"
$latestApi = "https://api.github.com/repos/$repo/releases/latest"

$Host.UI.RawUI.WindowTitle = "STeP AI Update & Sync (v$currentVersionText)"

function Show-Header {
    Clear-Host
    Write-Host "=================================================================" -ForegroundColor Cyan
    Write-Host "   STeP AI Update & Sync" -ForegroundColor Cyan
    Write-Host "   Current version: v$currentVersionText" -ForegroundColor Yellow
    Write-Host "   22 Teams • 43 Skills • Safe Workspace Upgrade" -ForegroundColor Gray
    Write-Host "=================================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Invoke-LocalSync {
    Write-Host "กำลังซิงก์ Skills, Rules และ Router จากเวอร์ชันที่ติดตั้งอยู่..." -ForegroundColor Yellow
    & $nodeBin "$rootDir\bin\step-ai.js" update --dest "$rootDir"
    if ($LASTEXITCODE -ne 0) {
        throw "Local workspace sync failed."
    }
}

function Finish-Update {
    Write-Host ""
    Write-Host "=================================================================" -ForegroundColor Green
    Write-Host "                 ✓ การอัปเดตเสร็จสมบูรณ์" -ForegroundColor Yellow
    Write-Host "=================================================================" -ForegroundColor Green
    Write-Host ""
    Read-Host "กด Enter เพื่อเสร็จสิ้น"
}

Show-Header
Write-Host "✓ Node.js Runtime: $(& $nodeBin -v)" -ForegroundColor Green

Set-Location $rootDir
Write-Host "กำลังตรวจสอบรุ่นล่าสุดจาก GitHub Releases..." -ForegroundColor Gray

$headers = @{
    "User-Agent" = "STeP-AI-Updater"
    "Accept" = "application/vnd.github+json"
}

try {
    $release = Invoke-RestMethod -Uri $latestApi -Headers $headers -Method Get -TimeoutSec 20
} catch {
    Write-Host "ไม่สามารถตรวจสอบ GitHub Releases ได้ในขณะนี้" -ForegroundColor Yellow
    Write-Host "ระบบจะซิงก์ Workspace จากเวอร์ชันที่ติดตั้งอยู่แทน" -ForegroundColor Gray
    Invoke-LocalSync
    Finish-Update
    exit 0
}

$latestVersionText = ([string]$release.tag_name) -replace "^[vV]", ""
try {
    $latestVersion = [version]$latestVersionText
} catch {
    Write-Host "รูปแบบ version จาก GitHub ไม่ถูกต้อง: $($release.tag_name)" -ForegroundColor Red
    Invoke-LocalSync
    Finish-Update
    exit 0
}

Write-Host "เวอร์ชันปัจจุบัน: v$currentVersionText" -ForegroundColor White
Write-Host "เวอร์ชันล่าสุด:  v$latestVersionText" -ForegroundColor White

if ($latestVersion -le $currentVersion) {
    Write-Host "✓ ใช้เวอร์ชันล่าสุดอยู่แล้ว" -ForegroundColor Green
    Invoke-LocalSync
    Finish-Update
    exit 0
}

$assetName = "STeP-AI-Pilot-v$latestVersionText.zip"
$asset = $release.assets | Where-Object { $_.name -eq $assetName } | Select-Object -First 1
if (-not $asset) {
    Write-Host "ไม่พบไฟล์ Release ที่ต้องการ: $assetName" -ForegroundColor Red
    Write-Host "ยังไม่มีการเปลี่ยนแปลงไฟล์ในเครื่อง" -ForegroundColor Gray
    Read-Host "กด Enter เพื่อออก"
    exit 1
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("step-ai-update-" + [guid]::NewGuid().ToString("N"))
$zipPath = Join-Path $tempRoot $assetName
$extractDir = Join-Path $tempRoot "release"

try {
    New-Item -ItemType Directory -Force -Path $extractDir | Out-Null

    Write-Host ""
    Write-Host "พบเวอร์ชันใหม่ v$latestVersionText กำลังดาวน์โหลด..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $asset.browser_download_url -Headers $headers -OutFile $zipPath -TimeoutSec 120

    $checksumAssetName = "$assetName.sha256"
    $checksumAsset = $release.assets | Where-Object { $_.name -eq $checksumAssetName } | Select-Object -First 1
    if ($checksumAsset) {
        $checksumPath = Join-Path $tempRoot $checksumAssetName
        Invoke-WebRequest -Uri $checksumAsset.browser_download_url -Headers $headers -OutFile $checksumPath -TimeoutSec 30
        $expectedHash = ((Get-Content -Raw $checksumPath).Trim() -split "\s+")[0].ToUpperInvariant()
        $actualHash = (Get-FileHash -Path $zipPath -Algorithm SHA256).Hash.ToUpperInvariant()
        if ($expectedHash -ne $actualHash) {
            throw "SHA-256 checksum mismatch. ยกเลิกการอัปเดตเพื่อความปลอดภัย"
        }
        Write-Host "✓ ตรวจสอบ SHA-256 ผ่าน" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Release นี้ไม่มี checksum file ระบบจะตรวจโครงสร้าง package ก่อนติดตั้ง" -ForegroundColor Yellow
    }

    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

    $newRoot = $extractDir
    if (-not (Test-Path (Join-Path $newRoot "package.json"))) {
        $candidate = Get-ChildItem -Path $extractDir -Directory | Where-Object {
            Test-Path (Join-Path $_.FullName "package.json")
        } | Select-Object -First 1
        if ($candidate) { $newRoot = $candidate.FullName }
    }

    $newPackagePath = Join-Path $newRoot "package.json"
    $newCliPath = Join-Path $newRoot "bin\step-ai.js"
    if (-not (Test-Path $newPackagePath) -or -not (Test-Path $newCliPath)) {
        throw "Downloaded Release package is incomplete."
    }

    $newPackage = Get-Content -Raw $newPackagePath | ConvertFrom-Json
    if ([string]$newPackage.version -ne $latestVersionText) {
        throw "Release version mismatch: expected $latestVersionText, found $($newPackage.version)"
    }

    Write-Host "กำลังสำรองข้อมูลและอัปเกรด Workspace..." -ForegroundColor Yellow
    & $nodeBin $newCliPath upgrade-apply --dest "$rootDir" --version "$latestVersionText"
    if ($LASTEXITCODE -ne 0) {
        throw "Version upgrade failed."
    }

    $currentVersionText = $latestVersionText
    Write-Host "✓ อัปเดตเป็น v$latestVersionText เรียบร้อย" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "อัปเดตเวอร์ชันไม่สำเร็จ: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "ระบบจะไม่ลบ USER.md, MEMORY.md หรือ output/ และจะใช้ Backup สำหรับ Rollback เมื่อจำเป็น" -ForegroundColor Gray
    Read-Host "กด Enter เพื่อออก"
    exit 1
} finally {
    if (Test-Path $tempRoot) {
        Remove-Item -Path $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Finish-Update
