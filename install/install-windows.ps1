# STeP AI — Zero-Terminal Windows Installer
# อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

if (-not $PSScriptRoot) {
    $PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}

$rootDir = (Resolve-Path "$PSScriptRoot\..").Path
. (Join-Path $PSScriptRoot "windows-runtime.ps1")
$nodeBin = Resolve-StepNode -RootDir $rootDir

$pilotVersion = [string](Get-Content -Raw (Join-Path $rootDir "package.json") | ConvertFrom-Json).version
$Host.UI.RawUI.WindowTitle = "STeP AI Setup (v$pilotVersion)"

function Show-Header {
    Clear-Host
    Write-Host "=================================================================" -ForegroundColor Cyan
    Write-Host "   ____ _____     ____       _    ___                            " -ForegroundColor Cyan
    Write-Host "  / ___|_   _|___|  _ \     / \  |_ _|   " -ForegroundColor Cyan -NoNewline
    Write-Host "STeP AI Setup (v$pilotVersion)       " -ForegroundColor Yellow
    Write-Host "  \___ \ | | / _ \ |_) |   / _ \  | |    " -ForegroundColor Cyan -NoNewline
    Write-Host "Enterprise AI Architecture      " -ForegroundColor Gray
    Write-Host "   ___) || ||  __/  __/   / ___ \ | |    " -ForegroundColor Cyan -NoNewline
    Write-Host "22 Teams • 5 Clusters           " -ForegroundColor Gray
    Write-Host "  |____/ |_| \___|_|     /_/   \_\___|                           " -ForegroundColor Cyan
    Write-Host "=================================================================" -ForegroundColor Cyan
    Write-Host "   อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP / RSP North) " -ForegroundColor White
    Write-Host "=================================================================" -ForegroundColor Cyan
    Write-Host ""
}

Show-Header

# 1. Node.js Runtime is resolved by windows-runtime.ps1.
Write-Host "กำลังตรวจสอบสภาพแวดล้อมระบบ..." -ForegroundColor Gray
Write-Host "✓ Node.js Runtime: $(& $nodeBin -v)" -ForegroundColor Green

# 2. AI application readiness is checked once after installation by doctor --employee.

Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "ตั้งค่าการใช้งาน: เลือกทีมหลัก (ข้ามได้)" -ForegroundColor Yellow
Write-Host "ระบบจะเตรียม instruction สำหรับ AI adapters ที่รองรับทั้งหมดโดยอัตโนมัติ" -ForegroundColor Gray
Write-Host "ถ้ายังไม่แน่ใจ ให้กด Enter หรือเลือก 0 แล้วเปลี่ยนภายหลังด้วย step-ai config" -ForegroundColor Gray
Write-Host ""

Set-Location $rootDir
& $nodeBin "$rootDir\bin\step-ai.js" init --tool all
if ($LASTEXITCODE -ne 0) {
    Write-Host "เกิดข้อผิดพลาดในการติดตั้ง กรุณาเปิด SUPPORT.md และส่งภาพหน้าจอตามช่องทางช่วยเหลือที่ระบุ" -ForegroundColor Red
    Read-Host "กด Enter เพื่อออก"
    exit 1
}

# 5. Run Doctor Check
Write-Host ""
& $nodeBin "$rootDir\bin\step-ai.js" doctor --employee

# 6. Finish
Write-Host ""
Write-Host "✓ ตรวจระบบเสร็จแล้ว — ใช้คำแนะนำเริ่มงานที่แสดงจาก STeP AI ด้านบน" -ForegroundColor Green
Write-Host "อัปเดตเวอร์ชันใหม่: ดับเบิลคลิก Update-STeP-AI.bat" -ForegroundColor DarkGray
Write-Host ""
Read-Host "กด Enter เพื่อเสร็จสิ้นการติดตั้ง"
