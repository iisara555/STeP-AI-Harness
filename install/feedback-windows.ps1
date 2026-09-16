# STeP AI — Feedback & Task Request (Pilot v0.2)
# อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "STeP AI Feedback & Tasks (Pilot v0.2)"

if (-not $PSScriptRoot) {
    $PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}

$rootDir = Resolve-Path "$PSScriptRoot\.."
Set-Location $rootDir

Clear-Host
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   ____ _____     ____       _    ___                            " -ForegroundColor Cyan
Write-Host "  / ___|_   _|___|  _ \     / \  |_ _|   " -ForegroundColor Cyan -NoNewline
Write-Host "STeP AI Feedback & Tasks        " -ForegroundColor Yellow
Write-Host "  \___ \ | | / _ \ |_) |   / _ \  | |    " -ForegroundColor Cyan -NoNewline
Write-Host "ศูนย์รับฟังข้อเสนอแนะและงานใหม่  " -ForegroundColor Gray
Write-Host "   ___) || ||  __/  __/   / ___ \ | |    " -ForegroundColor Cyan -NoNewline
Write-Host "สำหรับพนักงานอุทยานฯ 22 ทีม     " -ForegroundColor Gray
Write-Host "  |____/ |_| \___|_|     /_/   \_\___|                           " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP / RSP North) " -ForegroundColor White
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "ยินดีต้อนรับสู่ศูนย์รับฟังข้อเสนอแนะ STeP AI" -ForegroundColor Yellow
Write-Host "กรุณาเลือกสิ่งที่ท่านต้องการดำเนินการ:" -ForegroundColor White
Write-Host ""
Write-Host "  [1] AI ตอบไม่ถูก / อยากแจ้งปัญหา" -ForegroundColor Cyan
Write-Host "  [2] อยากให้ AI ช่วยงานเพิ่ม" -ForegroundColor Cyan
Write-Host "  [0] ปิด" -ForegroundColor Gray
Write-Host ""

$choice = Read-Host "พิมพ์หมายเลข (1, 2 หรือ 0)"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "กำลังเปิดแบบฟอร์มแจ้งปัญหา..." -ForegroundColor Gray
        & node "$rootDir\bin\step-ai.js" feedback --issue -d "$rootDir"
        $feedbackFile = "$rootDir\FEEDBACK.md"
        if (Test-Path $feedbackFile) {
            Write-Host "✓ เปิดไฟล์ FEEDBACK.md ใน Notepad ให้ท่านแล้ว..." -ForegroundColor Green
            Start-Process "notepad.exe" $feedbackFile
        }
        Write-Host ""
        Write-Host "คำแนะนำ: เมื่อพิมพ์เสร็จแล้วให้กด Save (Ctrl+S) แล้วส่งไฟล์ FEEDBACK.md" -ForegroundColor Yellow
        Write-Host "         ให้ AI Champion ประจำทีม หรือส่งในห้องแชทองค์กรได้เลยครับ" -ForegroundColor Yellow
    }
    "2" {
        Write-Host ""
        Write-Host "กำลังเปิดแบบฟอร์มของานเพิ่ม..." -ForegroundColor Gray
        & node "$rootDir\bin\step-ai.js" feedback --request -d "$rootDir"
        $requestFile = "$rootDir\REQUEST_NEW_TASK.md"
        if (Test-Path $requestFile) {
            Write-Host "✓ เปิดไฟล์ REQUEST_NEW_TASK.md ใน Notepad ให้ท่านแล้ว..." -ForegroundColor Green
            Start-Process "notepad.exe" $requestFile
        }
        Write-Host ""
        Write-Host "คำแนะนำ: เมื่อพิมพ์เสร็จแล้วให้กด Save (Ctrl+S) แล้วส่งไฟล์ REQUEST_NEW_TASK.md" -ForegroundColor Yellow
        Write-Host "         ให้หัวหน้าฝ่ายหรือ AI Champion เพื่อรับรองเข้าสู่ระบบกลางครับ" -ForegroundColor Yellow
    }
    "admin" {
        Write-Host ""
        & node "$rootDir\bin\step-ai.js" feedback --admin
    }
    default {
        Write-Host ""
        Write-Host "ปิดโปรแกรมเรียบร้อยแล้ว" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Green
Read-Host "กด Enter เพื่อเสร็จสิ้น"
