# STeP AI — One-Click Updater (Pilot v0.1)
# อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "STeP AI Update & Sync"

Clear-Host
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "           STeP AI Update & Skill Sync (Pilot v0.1)         " -ForegroundColor Yellow
Write-Host "   อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP) " -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$rootDir = Resolve-Path "$PSScriptRoot\.."
Set-Location $rootDir

Write-Host "กำลังตรวจสอบและอัปเดตทักษะองค์กรล่าสุด..." -ForegroundColor Gray
Write-Host ""

& node "$rootDir\bin\step-ai.js" update

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "                 ✓ การอัปเดตเสร็จสมบูรณ์                     " -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Read-Host "กด Enter เพื่อเสร็จสิ้น"
