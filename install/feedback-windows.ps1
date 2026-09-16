# STeP AI — Feedback & Skill Contribution (Pilot v0.2)
# อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "STeP AI Feedback & Skills (Pilot v0.2)"

if (-not $PSScriptRoot) {
    $PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}

$rootDir = Resolve-Path "$PSScriptRoot\.."
Set-Location $rootDir

Clear-Host
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   ____ _____     ____       _    ___                            " -ForegroundColor Cyan
Write-Host "  / ___|_   _|___|  _ \     / \  |_ _|   " -ForegroundColor Cyan -NoNewline
Write-Host "STeP AI Feedback & Skills       " -ForegroundColor Yellow
Write-Host "  \___ \ | | / _ \ |_) |   / _ \  | |    " -ForegroundColor Cyan -NoNewline
Write-Host "ศูนย์รับฟังและร่วมพัฒนาทักษะ     " -ForegroundColor Gray
Write-Host "   ___) || ||  __/  __/   / ___ \ | |    " -ForegroundColor Cyan -NoNewline
Write-Host "สำหรับพนักงานอุทยานฯ 22 ทีม     " -ForegroundColor Gray
Write-Host "  |____/ |_| \___|_|     /_/   \_\___|                           " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP / RSP North) " -ForegroundColor White
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "ยินดีต้อนรับสู่ศูนย์รับฟังความคิดเห็นและร่วมเสนอทักษะใหม่สำหรับพนักงาน STeP" -ForegroundColor Yellow
Write-Host "ท่านสามารถเลือกสิ่งที่ต้องการดำเนินการได้ดังนี้:" -ForegroundColor White
Write-Host ""
Write-Host "  [1] แจ้งข้อเสนอแนะ / แจ้งเมื่อ AI ตอบผิด (เปิดไฟล์แบบฟอร์มใน Notepad ทันที)" -ForegroundColor Cyan
Write-Host "  [2] เสนอคู่มือหรือทักษะใหม่ของทีม (เปิดไฟล์โครงร่าง Skill ใน Notepad ทันที)" -ForegroundColor Cyan
Write-Host "  [3] เปิดโฟลเดอร์ทักษะงาน (เปิดโฟลเดอร์ skills ใน Windows Explorer)" -ForegroundColor Cyan
Write-Host "  [4] เปิดหน้าเว็บส่งข้อเสนอแนะออนไลน์ผ่านเบราว์เซอร์" -ForegroundColor Cyan
Write-Host "  [0] ออกจากโปรแกรม" -ForegroundColor Gray
Write-Host ""

$choice = Read-Host "กรุณาพิมพ์หมายเลขที่ต้องการ (1, 2, 3, 4 หรือ 0)"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "กำลังสร้างแบบฟอร์มส่งข้อเสนอแนะ..." -ForegroundColor Gray
        & node "$rootDir\bin\step-ai.js" feedback --template -d "$rootDir"
        $feedbackFile = "$rootDir\FEEDBACK.md"
        if (Test-Path $feedbackFile) {
            Write-Host "✓ เปิดไฟล์ FEEDBACK.md ใน Notepad ให้ท่านแล้ว..." -ForegroundColor Green
            Start-Process "notepad.exe" $feedbackFile
        }
        Write-Host ""
        Write-Host "คำแนะนำ: กรอกข้อมูลในไฟล์ FEEDBACK.md แล้วส่งให้ AI Champion ประจำทีม" -ForegroundColor Yellow
        Write-Host "         หรือส่งในห้องแชทกลาง (Line OpenChat / Teams) ได้ทันทีครับ" -ForegroundColor Yellow
    }
    "2" {
        Write-Host ""
        Write-Host "กำลังสร้างเทมเพลตเสนอทักษะใหม่..." -ForegroundColor Gray
        & node "$rootDir\bin\step-ai.js" feedback --propose -d "$rootDir"
        $proposeFile = "$rootDir\SKILL_PROPOSAL_TEMPLATE.md"
        if (Test-Path $proposeFile) {
            Write-Host "✓ เปิดไฟล์ SKILL_PROPOSAL_TEMPLATE.md ใน Notepad ให้ท่านแล้ว..." -ForegroundColor Green
            Start-Process "notepad.exe" $proposeFile
        }
        Write-Host ""
        Write-Host "คำแนะนำ: กรอกรายละเอียดทักษะแล้วส่งให้ Domain Lead (หัวหน้าฝ่ายที่เกี่ยวข้อง)" -ForegroundColor Yellow
        Write-Host "         เพื่อตรวจสอบความถูกต้องของระเบียบก่อนนำขึ้นสู่ระบบกลางครับ" -ForegroundColor Yellow
    }
    "3" {
        Write-Host ""
        Write-Host "กำลังเปิดโฟลเดอร์ skills ใน Windows Explorer..." -ForegroundColor Gray
        Start-Process "explorer.exe" "$rootDir\skills"
        Write-Host "✓ เปิดโฟลเดอร์เรียบร้อยแล้ว ท่านสามารถดูหรือแก้ไขไฟล์ทักษะได้โดยตรง" -ForegroundColor Green
    }
    "4" {
        Write-Host ""
        Write-Host "กำลังเปิดหน้าเว็บส่งข้อเสนอแนะออนไลน์ในเบราว์เซอร์..." -ForegroundColor Gray
        & node "$rootDir\bin\step-ai.js" feedback --open
        Write-Host "✓ เปิดหน้าเว็บเรียบร้อยแล้ว" -ForegroundColor Green
    }
    default {
        Write-Host ""
        Write-Host "ออกจากโปรแกรมเรียบร้อยแล้ว" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Green
Read-Host "กด Enter เพื่อปิดหน้าต่างนี้"
