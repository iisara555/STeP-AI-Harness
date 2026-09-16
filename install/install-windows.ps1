# STeP AI — Zero-Terminal Windows Installer (Pilot v0.2)
# อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "STeP AI Setup (Pilot v0.2)"

if (-not $PSScriptRoot) {
    $PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}

function Show-Header {
    Clear-Host
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "               STeP AI Setup (Pilot v0.2)                   " -ForegroundColor Yellow -NoNewline
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

# 3. Select Team (Display all 22 teams)
Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "ขั้นตอนที่ 2: เลือกทีมหลักของคุณ (Primary Team — แสดงครบทั้ง 22 ทีม)" -ForegroundColor Yellow
Write-Host ""
Write-Host "● กลุ่มงาน: ธรรมาภิบาลและการบริหารจัดการ (Governance & Operations)" -ForegroundColor Cyan
Write-Host "   1. GA        - งานบริหารทั่วไป (ธุรการกลาง/เอกสาร)" -ForegroundColor White
Write-Host "   2. AFP       - บัญชี การเงิน และจัดซื้อ" -ForegroundColor White
Write-Host "   3. IASA      - ความร่วมมือระหว่างประเทศและพันธมิตร" -ForegroundColor White
Write-Host "   4. QS        - ระบบคุณภาพ (ISO และมาตรฐานองค์กร)" -ForegroundColor White
Write-Host "   5. NMCO      - ประสานเครือข่ายอุทยานวิทยาศาสตร์และ อว." -ForegroundColor White
Write-Host "   6. HD        - พัฒนาศักยภาพบุคลากร" -ForegroundColor White
Write-Host ""
Write-Host "● กลุ่มงาน: บ่มเพาะธุรกิจและยุทธศาสตร์องค์กร (Incubation & Strategy)" -ForegroundColor Cyan
Write-Host "   7. PITI      - บ่มเพาะศักยภาพนวัตกรรมและเทคโนโลยี" -ForegroundColor White
Write-Host "   8. ISI       - บ่มเพาะ Startup นวัตกรรม" -ForegroundColor White
Write-Host "   9. EIC       - การเป็นผู้ประกอบการและนวัตกรรม" -ForegroundColor White
Write-Host "  10. IMO       - บริหารจัดการนวัตกรรม" -ForegroundColor White
Write-Host "  11. SIT       - ยุทธศาสตร์ โครงการริเริ่ม และการเปลี่ยนแปลง" -ForegroundColor White
Write-Host ""
Write-Host "● กลุ่มงาน: ถ่ายทอดเทคโนโลยีและเชื่อมโยงอุตสาหกรรม (Tech Transfer & Industry)" -ForegroundColor Cyan
Write-Host "  12. TECH-SPIN - ถ่ายทอดเทคโนโลยีและบริษัท Spin-off" -ForegroundColor White
Write-Host "  13. TECH-UP   - เทคโนโลยีเชิงลึกและการขยายระดับการผลิต" -ForegroundColor White
Write-Host "  14. LINC      - ความร่วมมือท้องถิ่นและอุตสาหกรรม" -ForegroundColor White
Write-Host "  15. PUBSEC    - โครงการความร่วมมือภาครัฐ" -ForegroundColor White
Write-Host ""
Write-Host "● กลุ่มงาน: การตลาด การสื่อสาร และลูกค้าสัมพันธ์ (Market, Creative & Client)" -ForegroundColor Cyan
Write-Host "  16. CC        - งานสร้างสรรค์และการสื่อสาร" -ForegroundColor White
Write-Host "  17. MI        - นวัตกรรมตลาดสำหรับผลิตภัณฑ์นวัตกรรม" -ForegroundColor White
Write-Host "  18. CRM       - ลูกค้าสัมพันธ์" -ForegroundColor White
Write-Host ""
Write-Host "● กลุ่มงาน: โครงสร้างพื้นฐาน ห้องปฏิบัติการ และโรงงานต้นแบบ (Labs & Infrastructure)" -ForegroundColor Cyan
Write-Host "  19. IFU       - การใช้ประโยชน์พื้นที่และสิ่งอำนวยความสะดวก" -ForegroundColor White
Write-Host "  20. IQI       - พัฒนาคุณภาพโครงสร้างพื้นฐาน" -ForegroundColor White
Write-Host "  21. LES       - ห้องปฏิบัติการและเครื่องมือ" -ForegroundColor White
Write-Host "  22. FOODFABR  - โรงงานต้นแบบผลิตภัณฑ์อาหารนวัตกรรม" -ForegroundColor White
Write-Host ""

$teamMap = @{
    "1" = "ga";         "ga" = "ga"
    "2" = "afp";        "afp" = "afp"
    "3" = "iasa";       "iasa" = "iasa"
    "4" = "qs";         "qs" = "qs"
    "5" = "nmco";       "nmco" = "nmco"
    "6" = "hd";         "hd" = "hd"
    "7" = "piti";       "piti" = "piti"
    "8" = "isi";        "isi" = "isi"
    "9" = "eic";        "eic" = "eic"
    "10" = "imo";       "imo" = "imo"
    "11" = "sit";       "sit" = "sit"
    "12" = "tech-spin"; "tech-spin" = "tech-spin"; "techspin" = "tech-spin"
    "13" = "tech-up";   "tech-up" = "tech-up";     "techup" = "tech-up"
    "14" = "linc";      "linc" = "linc"
    "15" = "pubsec";    "pubsec" = "pubsec"
    "16" = "cc";        "cc" = "cc"
    "17" = "mi";        "mi" = "mi"
    "18" = "crm";       "crm" = "crm"
    "19" = "ifu";       "ifu" = "ifu"
    "20" = "iqi";       "iqi" = "iqi"
    "21" = "les";       "les" = "les"
    "22" = "foodfabr";  "foodfabr" = "foodfabr"
}

$teamChoice = Read-Host "พิมพ์หมายเลขทีม (1-22) หรือ รหัสทีม (เช่น 4 หรือ qs) [default: 4 (QS)]"
if ([string]::IsNullOrWhiteSpace($teamChoice)) {
    $selectedTeam = "qs"
} else {
    $normalizedTeam = $teamChoice.Trim().ToLower()
    if ($teamMap.ContainsKey($normalizedTeam)) {
        $selectedTeam = $teamMap[$normalizedTeam]
    } else {
        Write-Host "ไม่พบทีม '$teamChoice' ระบบจะใช้ค่าเริ่มต้น: QS (ระบบคุณภาพ)" -ForegroundColor Yellow
        $selectedTeam = "qs"
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
