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

# 2. Detect Installed AI Tools (8 Tools across 3 Tiers)
Write-Host ""
Write-Host "กำลังตรวจสอบโปรแกรม AI ในเครื่องของคุณ (ครอบคลุมทั้ง 3 สาย: สายฟรี, สายจ่ายตังค์, สาย Local AI)..." -ForegroundColor Gray

$appData = [System.Environment]::GetFolderPath('ApplicationData')
$localAppData = [System.Environment]::GetFolderPath('LocalApplicationData')
$userHome = [System.Environment]::GetFolderPath('UserProfile')

# 1. Cursor (Free Quota)
$cursorFound = (Test-Path "$localAppData\Programs\cursor") -or (Test-Path "$appData\Cursor") -or (Test-Path "$userHome\.cursor")
# 2. OpenCode (Free Quota)
$opencodeFound = (Test-Path "$appData\OpenCode") -or (Test-Path "$localAppData\Programs\OpenCode") -or (Test-Path "$userHome\.opencode") -or (Get-Command opencode -ErrorAction SilentlyContinue)
# 3. Claude Desktop (Paid / Commercial)
$claudeFound = (Test-Path "$appData\Claude") -or (Test-Path "$userHome\.claude") -or (Test-Path "$localAppData\Programs\Claude") -or (Get-Command claude -ErrorAction SilentlyContinue)
# 4. ChatGPT Desktop (Paid / Commercial)
$chatgptFound = (Test-Path "$localAppData\Programs\ChatGPT") -or (Test-Path "$appData\ChatGPT") -or (Test-Path "$localAppData\ChatGPT") -or (Get-Command chatgpt -ErrorAction SilentlyContinue)
# 5. Google Antigravity & Spark (Paid / Commercial)
$antigravityFound = (Test-Path "$userHome\.gemini\antigravity-ide") -or (Test-Path "$userHome\.gemini") -or (Get-Command agy -ErrorAction SilentlyContinue)
# 6. Hermes Agent (Local / Privacy)
$hermesFound = (Test-Path "$userHome\.hermes") -or (Test-Path "$userHome\hermes") -or (Test-Path "$appData\Hermes") -or (Get-Command hermes -ErrorAction SilentlyContinue) -or (Get-Command hermes-agent -ErrorAction SilentlyContinue)
# 7. Windsurf AI IDE (Free Quota)
$windsurfFound = (Test-Path "$localAppData\Programs\Windsurf") -or (Test-Path "$appData\Windsurf") -or (Test-Path "$userHome\.windsurf") -or (Get-Command windsurf -ErrorAction SilentlyContinue)
# 8. OpenAI Codex / VS Code (Free Quota)
$codexFound = (Test-Path "$appData\Code") -or (Test-Path "$userHome\.vscode") -or (Test-Path "$localAppData\Programs\Microsoft VS Code") -or (Get-Command code -ErrorAction SilentlyContinue)

$foundCount = 0
if ($cursorFound) { $foundCount++ }
if ($opencodeFound) { $foundCount++ }
if ($claudeFound) { $foundCount++ }
if ($chatgptFound) { $foundCount++ }
if ($antigravityFound) { $foundCount++ }
if ($hermesFound) { $foundCount++ }
if ($windsurfFound) { $foundCount++ }
if ($codexFound) { $foundCount++ }

Write-Host "ผลการตรวจจับโปรแกรม AI ในเครื่องของคุณ:" -ForegroundColor White

Write-Host " ● สายฟรี / มี Quota ฟรี (Free Quota Tier):" -ForegroundColor Cyan
if ($cursorFound) { Write-Host "    [✓] Cursor IDE                       (พบในเครื่อง - พร้อมใช้งาน)" -ForegroundColor Green } else { Write-Host "    [ ] Cursor IDE                       (ยังไม่พบในเครื่อง)" -ForegroundColor DarkGray }
if ($opencodeFound) { Write-Host "    [✓] OpenCode AI Assistant            (พบในเครื่อง - พร้อมใช้งาน)" -ForegroundColor Green } else { Write-Host "    [ ] OpenCode AI Assistant            (ยังไม่พบในเครื่อง)" -ForegroundColor DarkGray }
if ($windsurfFound) { Write-Host "    [✓] Windsurf AI IDE (Codeium)        (พบในเครื่อง - พร้อมใช้งาน)" -ForegroundColor Green } else { Write-Host "    [ ] Windsurf AI IDE (Codeium)        (ยังไม่พบในเครื่อง)" -ForegroundColor DarkGray }
if ($codexFound) { Write-Host "    [✓] OpenAI Codex / VS Code           (พบในเครื่อง - พร้อมใช้งาน)" -ForegroundColor Green } else { Write-Host "    [ ] OpenAI Codex / VS Code           (ยังไม่พบในเครื่อง)" -ForegroundColor DarkGray }

Write-Host " ● สายจ่ายตังค์ / องค์กรจัดซื้อ (Paid / Commercial Tier):" -ForegroundColor Yellow
if ($claudeFound) { Write-Host "    [✓] Claude Desktop / Claude Code     (พบในเครื่อง - พร้อมใช้งาน)" -ForegroundColor Green } else { Write-Host "    [ ] Claude Desktop / Claude Code     (ยังไม่พบในเครื่อง)" -ForegroundColor DarkGray }
if ($chatgptFound) { Write-Host "    [✓] ChatGPT Desktop                  (พบในเครื่อง - พร้อมใช้งาน)" -ForegroundColor Green } else { Write-Host "    [ ] ChatGPT Desktop                  (ยังไม่พบในเครื่อง)" -ForegroundColor DarkGray }
if ($antigravityFound) { Write-Host "    [✓] Google Antigravity & Spark       (พบในเครื่อง - พร้อมใช้งาน)" -ForegroundColor Green } else { Write-Host "    [ ] Google Antigravity & Spark       (ยังไม่พบในเครื่อง)" -ForegroundColor DarkGray }

Write-Host " ● สาย Local AI / ความเป็นส่วนตัวข้อมูลสูงสุด (Local / Privacy Tier):" -ForegroundColor Magenta
if ($hermesFound) { Write-Host "    [✓] Hermes Agent (Nous / Local AI)   (พบในเครื่อง - พร้อมใช้งาน)" -ForegroundColor Green } else { Write-Host "    [ ] Hermes Agent (Nous / Local AI)   (ยังไม่พบในเครื่อง)" -ForegroundColor DarkGray }

# No approved AI tool detected: continue Harness install but do not open external signup/download pages.
if ($foundCount -eq 0) {
    Write-Host ""
    Write-Host "⚠️  ยังไม่พบโปรแกรม AI ที่องค์กรอนุมัติในเครื่องนี้" -ForegroundColor Yellow
    Write-Host "ติดตั้ง STeP AI ต่อได้ แต่ก่อนใช้งานให้ติดต่อ AI Champion เพื่อยืนยันโปรแกรม AI ที่ใช้ได้" -ForegroundColor Gray
    Write-Host "ระบบจะไม่เปิดเว็บสมัครหรือดาวน์โหลดโปรแกรม AI ให้โดยอัตโนมัติ" -ForegroundColor Gray
}

Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "ตั้งค่าการใช้งาน: เลือกกลุ่มงาน/ทีม (ข้ามได้)" -ForegroundColor Yellow
Write-Host "ระบบจะเตรียม instruction สำหรับ AI adapters ที่รองรับทั้งหมดโดยอัตโนมัติ" -ForegroundColor Gray
Write-Host "ถ้ายังไม่แน่ใจ ให้เลือก 0 ได้ และเปลี่ยนภายหลังด้วย step-ai config" -ForegroundColor Gray
Write-Host ""

Set-Location $rootDir
& $nodeBin "$rootDir\bin\step-ai.js" init --tool all
if ($LASTEXITCODE -ne 0) {
    Write-Host "เกิดข้อผิดพลาดในการติดตั้ง กรุณาติดต่อ AI Champion ประจำทีม" -ForegroundColor Red
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
