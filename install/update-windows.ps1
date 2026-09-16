# STeP AI — One-Click Updater (Pilot v0.2)
# อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "STeP AI Update & Sync (Pilot v0.2)"

if (-not $PSScriptRoot) {
    $PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}

Clear-Host
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   ____ _____     ____       _    ___                            " -ForegroundColor Cyan
Write-Host "  / ___|_   _|___|  _ \     / \  |_ _|   " -ForegroundColor Cyan -NoNewline
Write-Host "STeP AI Update & Sync (Pilot v0.2)" -ForegroundColor Yellow
Write-Host "  \___ \ | | / _ \ |_) |   / _ \  | |    " -ForegroundColor Cyan -NoNewline
Write-Host "Enterprise AI Architecture      " -ForegroundColor Gray
Write-Host "   ___) || ||  __/  __/   / ___ \ | |    " -ForegroundColor Cyan -NoNewline
Write-Host "22 Teams • 5 Clusters           " -ForegroundColor Gray
Write-Host "  |____/ |_| \___|_|     /_/   \_\___|                           " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP / RSP North) " -ForegroundColor White
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""

$rootDir = Resolve-Path "$PSScriptRoot\.."
Set-Location $rootDir

Write-Host "กำลังตรวจสอบและอัปเดตทักษะองค์กรล่าสุด..." -ForegroundColor Gray
Write-Host ""

& node "$rootDir\bin\step-ai.js" update

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Green
Write-Host "                 ✓ การอัปเดตเสร็จสมบูรณ์                     " -ForegroundColor Yellow
Write-Host "=================================================================" -ForegroundColor Green
Write-Host ""
Read-Host "กด Enter เพื่อเสร็จสิ้น"
