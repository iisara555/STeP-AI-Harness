# STeP AI — Zero-Terminal Windows Installer (Pilot v0.1)
# อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "STeP AI Setup (Pilot v0.1)"

function Show-Header {
    Clear-Host
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "               STeP AI Setup (Pilot v0.1)                   " -ForegroundColor Yellow -NoNewline
    Write-Host ""
    Write-Host "   อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP) " -ForegroundColor White
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
}

Show-Header

# 1. Check Node.js Runtime
Write-Host "กำลังตรวจสอบสภาพแวดล้อมระบบ..." -ForegroundColor Gray
$nodeInstalled = $false
try {
    $nodeVer = & node -v 2>$null
    if ($nodeVer) {
        $nodeInstalled = $true
        Write-Host "✓ พบ Node.js Runtime: $nodeVer" -ForegroundColor Green
    }
} catch {
    $nodeInstalled = $false
}

if (-not $nodeInstalled) {
    Write-Host ""
    Write-Host "⚠️  ไม่พบ Node.js ในเครื่องคอมพิวเตอร์ของคุณ" -ForegroundColor Yellow
    Write-Host "ระบบ STeP AI จำเป็นต้องใช้ Node.js (v20 ขึ้นไป) เพื่อประมวลผล Skill Router" -ForegroundColor Gray
    Write-Host ""
    Write-Host "กรุณาดาวน์โหลดและติดตั้งได้ฟรีที่: https://nodejs.org (เลือกเวอร์ชัน LTS)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "หากติดตั้งแล้ว กรุณาเปิดไฟล์ Install-STeP-AI.bat ใหม่อีกครั้ง" -ForegroundColor Gray
    Write-Host ""
    Read-Host "กด Enter เพื่อออกจากโปรแกรม"
    exit 1
}

# 2. Detect Installed AI Tools
Write-Host ""
Write-Host "กำลังตรวจสอบโปรแกรม AI ในเครื่อง..." -ForegroundColor Gray

$appData = [System.Environment]::GetFolderPath('ApplicationData')
$localAppData = [System.Environment]::GetFolderPath('LocalApplicationData')
$userHome = [System.Environment]::GetFolderPath('UserProfile')

$codexFound = (Test-Path "$appData\Code") -or (Test-Path "$userHome\.vscode") -or (Test-Path "$localAppData\Programs\Microsoft VS Code")
$cursorFound = (Test-Path "$localAppData\Programs\cursor") -or (Test-Path "$appData\Cursor") -or (Test-Path "$userHome\.cursor")
$claudeFound = (Test-Path "$appData\Claude") -or (Test-Path "$userHome\.claude") -or (Test-Path "$localAppData\Programs\Claude")

Write-Host "ผลการตรวจจับเครื่องมือ AI:" -ForegroundColor White
if ($codexFound) { Write-Host "  [✓] OpenAI Codex / VS Code" -ForegroundColor Green } else { Write-Host "  [ ] OpenAI Codex / VS Code" -ForegroundColor DarkGray }
if ($cursorFound) { Write-Host "  [✓] Cursor IDE" -ForegroundColor Green } else { Write-Host "  [ ] Cursor IDE" -ForegroundColor DarkGray }
if ($claudeFound) { Write-Host "  [✓] Claude Desktop / Claude Code" -ForegroundColor Green } else { Write-Host "  [ ] Claude Desktop / Claude Code" -ForegroundColor DarkGray }

Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "ขั้นตอนที่ 1: เลือกเครื่องมือ AI ที่คุณต้องการติดตั้ง" -ForegroundColor Yellow
Write-Host "  1. ติดตั้งทั้งหมดที่ตรวจพบ (แนะนำ)" -ForegroundColor White
Write-Host "  2. OpenAI Codex / VS Code" -ForegroundColor White
Write-Host "  3. Cursor IDE" -ForegroundColor White
Write-Host "  4. Claude Desktop / Claude Code" -ForegroundColor White
Write-Host ""

$toolChoice = Read-Host "พิมพ์หมายเลข (1-4) [default: 1]"
if ([string]::IsNullOrWhiteSpace($toolChoice)) { $toolChoice = "1" }

$selectedTool = "all"
switch ($toolChoice) {
    "1" { $selectedTool = "all" }
    "2" { $selectedTool = "codex" }
    "3" { $selectedTool = "cursor" }
    "4" { $selectedTool = "claude" }
    default { $selectedTool = "all" }
}

# 3. Select Team
Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "ขั้นตอนที่ 2: เลือกทีมหลักของคุณ (Primary Team)" -ForegroundColor Yellow
Write-Host "  1. QS   - ระบบบริหารคุณภาพ ISO" -ForegroundColor White
Write-Host "  2. AFP  - บัญชี การเงิน และจัดซื้อ" -ForegroundColor White
Write-Host "  3. CC   - การสื่อสารองค์กรและการตลาด" -ForegroundColor White
Write-Host "  4. MI   - วิเคราะห์ข้อมูลการตลาดและธุรกิจ" -ForegroundColor White
Write-Host "  5. PITI - นวัตกรรมสตาร์ทอัพและบ่มเพาะธุรกิจ" -ForegroundColor White
Write-Host "  --------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  A. แสดงรายชื่อครบทั้ง 22 ทีมของ STeP" -ForegroundColor Cyan
Write-Host ""

$teamChoice = Read-Host "พิมพ์หมายเลขทีม (1-5) หรือ 'A' เพื่อดูทั้งหมด [default: 1]"
if ([string]::IsNullOrWhiteSpace($teamChoice)) { $teamChoice = "1" }

$selectedTeam = "qs"
if ($teamChoice -eq "A" -or $teamChoice -eq "a") {
    Write-Host ""
    & node "$PSScriptRoot\..\bin\step-ai.js" teams
    Write-Host ""
    $teamCodeInput = Read-Host "พิมพ์รหัสทีมของคุณ (เช่น qs, afp, cc, mi, piti, linc, etc.)"
    if (-not [string]::IsNullOrWhiteSpace($teamCodeInput)) {
        $selectedTeam = $teamCodeInput.Trim().ToLower()
    }
} else {
    switch ($teamChoice) {
        "1" { $selectedTeam = "qs" }
        "2" { $selectedTeam = "afp" }
        "3" { $selectedTeam = "cc" }
        "4" { $selectedTeam = "mi" }
        "5" { $selectedTeam = "piti" }
        default { $selectedTeam = "qs" }
    }
}

# 4. Perform Installation
Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "ขั้นตอนที่ 3: กำลังติดตั้ง STeP AI ให้พร้อมใช้งาน..." -ForegroundColor Yellow
Write-Host ""

$rootDir = Resolve-Path "$PSScriptRoot\.."
Set-Location $rootDir

# Run init
& node "$rootDir\bin\step-ai.js" init --team $selectedTeam --tool $selectedTool
if ($LASTEXITCODE -ne 0) {
    Write-Host "เกิดข้อผิดพลาดในการติดตั้ง กรุณาติดต่อผู้ดูแลระบบ" -ForegroundColor Red
    Read-Host "กด Enter เพื่อออก"
    exit 1
}

# Run config update
& node "$rootDir\bin\step-ai.js" config --team $selectedTeam

# 5. Run Doctor Check
Write-Host ""
& node "$rootDir\bin\step-ai.js" doctor --employee

# 6. Success Screen
Write-Host "============================================================" -ForegroundColor Green
Write-Host "                 ✓ STeP AI พร้อมใช้งาน                      " -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  ทีมหลัก:       $($selectedTeam.ToUpper())" -ForegroundColor White
Write-Host "  เครื่องมือ AI:  $selectedTool" -ForegroundColor White
Write-Host "  ระบบค้นหา:     Layer 1 Dynamic Router พร้อมใช้งาน" -ForegroundColor White
Write-Host ""
Write-Host "💡 วิธีเริ่มใช้งาน:" -ForegroundColor Cyan
Write-Host "  1. เปิดโปรแกรม AI ที่คุณเลือก (Cursor, VS Code หรือ Claude)" -ForegroundColor White
Write-Host "  2. เปิดโฟลเดอร์นี้ หรือเริ่มพิมพ์คุยงานภาษาไทยได้ทันที เช่น:" -ForegroundColor White
Write-Host "     - 'ช่วยตรวจเอกสารนี้ก่อนส่ง'" -ForegroundColor Gray
Write-Host "     - 'ช่วยตรวจ Internal Audit ชุดนี้'" -ForegroundColor Gray
Write-Host "     - 'ช่วยตรวจ TOR จัดซื้อระบบ หน่อยครับ'" -ForegroundColor Gray
Write-Host ""
Write-Host "  หากต้องการเปลี่ยนทีมในอนาคต: รัน 'step-ai config'" -ForegroundColor DarkGray
Write-Host "  หากต้องการอัปเดตเวอร์ชันใหม่: ดับเบิลคลิก Update-STeP-AI.bat" -ForegroundColor DarkGray
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""

Read-Host "กด Enter เพื่อเสร็จสิ้นการติดตั้ง"
