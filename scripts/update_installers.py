from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

PS1_CONTENT = """# STeP AI — Zero-Terminal Windows Installer (Pilot v0.2)
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

# 2. Detect Installed AI Tools (8 Tools across 3 Tiers)
Write-Host ""
Write-Host "กำลังตรวจสอบโปรแกรม AI ในเครื่องของคุณ (ครอบคลุมทั้ง 3 สาย: สายฟรี, สายจ่ายตังค์, สาย Local AI)..." -ForegroundColor Gray

$appData = [System.Environment]::GetFolderPath('ApplicationData')
$localAppData = [System.Environment]::GetFolderPath('LocalApplicationData')
$userHome = [System.Environment]::GetFolderPath('UserProfile')

# 1. Cursor (Free Quota)
$cursorFound = (Test-Path "$localAppData\\Programs\\cursor") -or (Test-Path "$appData\\Cursor") -or (Test-Path "$userHome\\.cursor")
# 2. OpenCode (Free Quota)
$opencodeFound = (Test-Path "$appData\\OpenCode") -or (Test-Path "$localAppData\\Programs\\OpenCode") -or (Test-Path "$userHome\\.opencode") -or (Get-Command opencode -ErrorAction SilentlyContinue)
# 3. Claude Desktop (Paid / Commercial)
$claudeFound = (Test-Path "$appData\\Claude") -or (Test-Path "$userHome\\.claude") -or (Test-Path "$localAppData\\Programs\\Claude") -or (Get-Command claude -ErrorAction SilentlyContinue)
# 4. ChatGPT Desktop (Paid / Commercial)
$chatgptFound = (Test-Path "$localAppData\\Programs\\ChatGPT") -or (Test-Path "$appData\\ChatGPT") -or (Test-Path "$localAppData\\ChatGPT") -or (Get-Command chatgpt -ErrorAction SilentlyContinue)
# 5. Google Antigravity & Spark (Paid / Commercial)
$antigravityFound = (Test-Path "$userHome\\.gemini\\antigravity-ide") -or (Test-Path "$userHome\\.gemini") -or (Get-Command agy -ErrorAction SilentlyContinue)
# 6. Hermes Agent (Local / Privacy)
$hermesFound = (Test-Path "$userHome\\.hermes") -or (Test-Path "$userHome\\hermes") -or (Test-Path "$appData\\Hermes") -or (Get-Command hermes -ErrorAction SilentlyContinue) -or (Get-Command hermes-agent -ErrorAction SilentlyContinue)
# 7. Windsurf AI IDE (Free Quota)
$windsurfFound = (Test-Path "$localAppData\\Programs\\Windsurf") -or (Test-Path "$appData\\Windsurf") -or (Test-Path "$userHome\\.windsurf") -or (Get-Command windsurf -ErrorAction SilentlyContinue)
# 8. OpenAI Codex / VS Code (Free Quota)
$codexFound = (Test-Path "$appData\\Code") -or (Test-Path "$userHome\\.vscode") -or (Test-Path "$localAppData\\Programs\\Microsoft VS Code") -or (Get-Command code -ErrorAction SilentlyContinue)

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

# Zero-Tool Guided Wizard
if ($foundCount -eq 0) {
    Write-Host ""
    Write-Host "⚠️  ยังไม่พบโปรแกรม AI ใดๆ ในเครื่องคอมพิวเตอร์ของคุณ" -ForegroundColor Yellow
    Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "🧭 [คำแนะนำการเลือก AI ให้เหมาะกับรูปแบบการทำงานของคุณ]:" -ForegroundColor Cyan
    Write-Host "  1. สายฟรี / มี Quota ฟรี  (แนะนำมากที่สุดสำหรับเริ่มต้นใช้งาน — ไม่มีค่าใช้จ่าย):" -ForegroundColor White
    Write-Host "     - ⭐ Cursor IDE: เปิดโฟลเดอร์นี้แล้วคุยภาษาไทยได้ทันที มีโควตาฟรี (https://cursor.com)" -ForegroundColor Gray
    Write-Host "     - ⭐ OpenCode: ผู้ช่วย AI ใช้งานง่ายพร้อมโควตาฟรี (https://opencode.ai)" -ForegroundColor Gray
    Write-Host "  2. สายจ่ายตังค์ / องค์กรจัดซื้อ (สำหรับท่านที่มีสิทธิ์ Pro/Plus หรือ License หน่วยงาน):" -ForegroundColor White
    Write-Host "     - ChatGPT Desktop / Claude Desktop / Google Antigravity & Spark" -ForegroundColor Gray
    Write-Host "  3. สาย Local AI (สำหรับผู้ต้องการความปลอดภัยข้อมูล 100% ประมวลผลในเครื่อง):" -ForegroundColor White
    Write-Host "     - Hermes Agent (pip install hermes-agent)" -ForegroundColor Gray
    Write-Host "  4. ดำเนินการติดตั้ง STeP AI ต่อทันที (ไปดาวน์โหลด AI ภายหลัง)" -ForegroundColor White
    Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
    
    $guideChoice = Read-Host "ต้องการให้ระบบแนะนำและเปิดหน้าดาวน์โหลดสายฟรีหรือไม่? (พิมพ์ 1 เพื่อเปิดหน้าดาวน์โหลด / กด Enter เพื่อข้าม) [default: 1]"
    if ([string]::IsNullOrWhiteSpace($guideChoice)) { $guideChoice = "1" }
    
    if ($guideChoice -eq "1") {
        Write-Host ""
        Write-Host "เลือกโปรแกรมสายฟรีที่ต้องการเปิดหน้าเว็บดาวน์โหลด:" -ForegroundColor Cyan
        Write-Host "  1. Cursor IDE (https://cursor.com) [แนะนำที่สุด]" -ForegroundColor White
        Write-Host "  2. OpenCode AI (https://opencode.ai)" -ForegroundColor White
        Write-Host "  3. ข้ามไปขั้นตอนติดตั้งต่อ" -ForegroundColor Gray
        $downloadChoice = Read-Host "พิมพ์หมายเลข (1-3) [default: 1]"
        if ([string]::IsNullOrWhiteSpace($downloadChoice)) { $downloadChoice = "1" }
        
        if ($downloadChoice -eq "1") {
            Write-Host "กำลังเปิดเบราว์เซอร์เพื่อดาวน์โหลด Cursor IDE..." -ForegroundColor Green
            Start-Process "https://cursor.com"
        } elseif ($downloadChoice -eq "2") {
            Write-Host "กำลังเปิดเบราว์เซอร์เพื่อดาวน์โหลด OpenCode..." -ForegroundColor Green
            Start-Process "https://opencode.ai"
        }
    }
}

Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "ขั้นตอนที่ 1: เลือกเครื่องมือ AI ที่คุณต้องการติดตั้งคำสั่ง" -ForegroundColor Yellow
Write-Host "  1. ติดตั้งให้ทุกค่าย (All 8 Tools: Cursor, OpenCode, Claude, ChatGPT, Antigravity, Hermes, Windsurf, VS Code) [แนะนำ]" -ForegroundColor White
Write-Host "  2. Cursor IDE (สายฟรีมีโควตา)" -ForegroundColor White
Write-Host "  3. OpenCode AI Assistant (สายฟรีมีโควตา)" -ForegroundColor White
Write-Host "  4. Claude Desktop / Claude Code (สายจ่ายตังค์)" -ForegroundColor White
Write-Host "  5. ChatGPT Desktop (สายจ่ายตังค์)" -ForegroundColor White
Write-Host "  6. Google Antigravity & Spark (สายจ่ายตังค์)" -ForegroundColor White
Write-Host "  7. Hermes Agent (สาย Local AI)" -ForegroundColor White
Write-Host "  8. Windsurf AI IDE (สายฟรีมีโควตา)" -ForegroundColor White
Write-Host "  9. OpenAI Codex / VS Code (สายฟรีมีโควตา)" -ForegroundColor White
Write-Host ""

$toolChoice = Read-Host "พิมพ์หมายเลข (1-9) [default: 1]"
if ([string]::IsNullOrWhiteSpace($toolChoice)) { $toolChoice = "1" }

$selectedTool = "all"
switch ($toolChoice) {
    "1" { $selectedTool = "all" }
    "2" { $selectedTool = "cursor" }
    "3" { $selectedTool = "opencode" }
    "4" { $selectedTool = "claude" }
    "5" { $selectedTool = "chatgpt" }
    "6" { $selectedTool = "antigravity" }
    "7" { $selectedTool = "hermes" }
    "8" { $selectedTool = "windsurf" }
    "9" { $selectedTool = "codex" }
    default { $selectedTool = "all" }
}

# 3. Select Team (Display all 22 teams)
Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "ขั้นตอนที่ 2: เลือกทีมหลักของคุณ (Primary Team — แสดงครบทั้ง 22 ทีม)" -ForegroundColor Yellow
Write-Host ""
Write-Host "● กลุ่มงาน: ธรรมาภิบาลและการบริหารจัดการ (Governance and Operations)" -ForegroundColor Cyan
Write-Host "   1. GA        - งานบริหารทั่วไป (ธุรการกลาง/เอกสาร)" -ForegroundColor White
Write-Host "   2. AFP       - บัญชี การเงิน และจัดซื้อ" -ForegroundColor White
Write-Host "   3. IASA      - ความร่วมมือระหว่างประเทศและพันธมิตร" -ForegroundColor White
Write-Host "   4. QS        - ระบบคุณภาพ (ISO และมาตรฐานองค์กร)" -ForegroundColor White
Write-Host "   5. NMCO      - ประสานเครือข่ายอุทยานวิทยาศาสตร์และ อว." -ForegroundColor White
Write-Host "   6. HD        - พัฒนาศักยภาพบุคลากร" -ForegroundColor White
Write-Host ""
Write-Host "● กลุ่มงาน: บ่มเพาะธุรกิจและยุทธศาสตร์องค์กร (Incubation and Strategy)" -ForegroundColor Cyan
Write-Host "   7. PITI      - บ่มเพาะศักยภาพนวัตกรรมและเทคโนโลยี" -ForegroundColor White
Write-Host "   8. ISI       - บ่มเพาะ Startup นวัตกรรม" -ForegroundColor White
Write-Host "   9. EIC       - การเป็นผู้ประกอบการและนวัตกรรม" -ForegroundColor White
Write-Host "  10. IMO       - บริหารจัดการนวัตกรรม" -ForegroundColor White
Write-Host "  11. SIT       - ยุทธศาสตร์ โครงการริเริ่ม และการเปลี่ยนแปลง" -ForegroundColor White
Write-Host ""
Write-Host "● กลุ่มงาน: ถ่ายทอดเทคโนโลยีและเชื่อมโยงอุตสาหกรรม (Tech Transfer and Industry)" -ForegroundColor Cyan
Write-Host "  12. TECH-SPIN - ถ่ายทอดเทคโนโลยีและบริษัท Spin-off" -ForegroundColor White
Write-Host "  13. TECH-UP   - เทคโนโลยีเชิงลึกและการขยายระดับการผลิต" -ForegroundColor White
Write-Host "  14. LINC      - ความร่วมมือท้องถิ่นและอุตสาหกรรม" -ForegroundColor White
Write-Host "  15. PUBSEC    - โครงการความร่วมมือภาครัฐ" -ForegroundColor White
Write-Host ""
Write-Host "● กลุ่มงาน: การตลาด การสื่อสาร และลูกค้าสัมพันธ์ (Market, Creative and Client)" -ForegroundColor Cyan
Write-Host "  16. CC        - งานสร้างสรรค์และการสื่อสาร" -ForegroundColor White
Write-Host "  17. MI        - นวัตกรรมตลาดสำหรับผลิตภัณฑ์นวัตกรรม" -ForegroundColor White
Write-Host "  18. CRM       - ลูกค้าสัมพันธ์" -ForegroundColor White
Write-Host ""
Write-Host "● กลุ่มงาน: โครงสร้างพื้นฐาน ห้องปฏิบัติการ และโรงงานต้นแบบ (Labs and Infrastructure)" -ForegroundColor Cyan
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

$rootDir = Resolve-Path "$PSScriptRoot\\.."
Set-Location $rootDir

# Run init
& node "$rootDir\\bin\\step-ai.js" init --team $selectedTeam --tool $selectedTool
if ($LASTEXITCODE -ne 0) {
    Write-Host "เกิดข้อผิดพลาดในการติดตั้ง กรุณาติดต่อผู้ดูแลระบบ" -ForegroundColor Red
    Read-Host "กด Enter เพื่อออก"
    exit 1
}

# Run config update
& node "$rootDir\\bin\\step-ai.js" config --team $selectedTeam

# 5. Run Doctor Check
Write-Host ""
& node "$rootDir\\bin\\step-ai.js" doctor --employee

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
Write-Host "  1. เปิดโปรแกรม AI ที่คุณเลือก (Cursor, OpenCode, VS Code, Claude หรือ ChatGPT Desktop)" -ForegroundColor White
Write-Host "  2. ในโปรแกรม AI ให้เปิดโฟลเดอร์ระบบ STeP AI นี้ (เมนู File -> Open Folder):" -ForegroundColor White
Write-Host "     📁 $rootDir" -ForegroundColor Yellow
Write-Host "  3. เริ่มพิมพ์คุยงานภาษาไทยในช่องแชท AI ได้ทันที เช่น:" -ForegroundColor White
Write-Host "     - 'ช่วยตรวจเอกสารนี้ก่อนส่ง'" -ForegroundColor Gray
Write-Host "     - 'ช่วยตรวจ Internal Audit ชุดนี้'" -ForegroundColor Gray
Write-Host "     - 'ช่วยตรวจ TOR จัดซื้อระบบ หน่อยครับ'" -ForegroundColor Gray
Write-Host "     (สามารถลากไฟล์งาน Word, PDF หรือ Excel เข้ามาวางในโฟลเดอร์นี้เพื่อให้ AI ช่วยตรวจได้)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  หากต้องการเปลี่ยนทีมในอนาคต: รัน 'step-ai config'" -ForegroundColor DarkGray
Write-Host "  หากต้องการอัปเดตเวอร์ชันใหม่: ดับเบิลคลิก Update-STeP-AI.bat" -ForegroundColor DarkGray
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""

Read-Host "กด Enter เพื่อเสร็จสิ้นการติดตั้ง"
"""

SH_CONTENT = """#!/usr/bin/env bash
# STeP AI — Zero-Terminal macOS Installer (Pilot v0.2)
# อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
CYAN='\\033[0;36m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
WHITE='\\033[1;37m'
GRAY='\\033[0;90m'
RED='\\033[0;31m'
MAGENTA='\\033[0;35m'
NC='\\033[0m'

clear || true
echo -e "${CYAN}============================================================${NC}"
echo -e "${YELLOW}               STeP AI Setup (Pilot v0.2)                   ${NC}"
echo -e "${WHITE}   อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP) ${NC}"
echo -e "${CYAN}============================================================${NC}"
echo ""

# 1. Detect macOS
OS_NAME="$(uname -s)"
if [ "$OS_NAME" != "Darwin" ]; then
    echo -e "${RED}⚠️  สคริปต์นี้สำหรับ macOS เท่านั้น (ระบบปัจจุบัน: $OS_NAME)${NC}"
    echo -e "${GRAY}หากคุณใช้ Windows กรุณาดับเบิลคลิกไฟล์ Install-STeP-AI.bat แทน${NC}"
    read -p "กด Enter เพื่อออก..." dummy
    exit 1
fi

# 2. Detect CPU architecture
ARCH="$(uname -m)"
ARCH_DISPLAY="$ARCH"
if [ "$ARCH" = "arm64" ]; then
    ARCH_DISPLAY="Apple Silicon ($ARCH)"
elif [ "$ARCH" = "x86_64" ]; then
    ARCH_DISPLAY="Intel Mac ($ARCH)"
fi
echo -e "${GRAY}สถาปัตยกรรมระบบ: ${WHITE}${ARCH_DISPLAY}${NC}"

# 3. Detect required runtime (Node.js >= 20)
echo -e "${GRAY}กำลังตรวจสอบ Node.js runtime...${NC}"
if ! command -v node >/dev/null 2>&1; then
    echo ""
    echo -e "${YELLOW}⚠️  ไม่พบ Node.js ในเครื่อง Mac ของคุณ${NC}"
    echo -e "${GRAY}ระบบ STeP AI จำเป็นต้องใช้ Node.js (v20 ขึ้นไป) เพื่อประมวลผล Skill Router${NC}"
    echo ""
    echo -e "กรุณาดาวน์โหลดและติดตั้งได้ฟรีที่: ${CYAN}https://nodejs.org${NC} (เลือกเวอร์ชัน LTS)"
    echo -e "หรือติดตั้งผ่าน Homebrew: ${CYAN}brew install node${NC}"
    echo ""
    echo -e "${GRAY}หากติดตั้งแล้ว กรุณาดับเบิลคลิกไฟล์ Install-STeP-AI.command ใหม่อีกครั้ง${NC}"
    echo ""
    read -p "กด Enter เพื่อออกจากโปรแกรม..." dummy
    exit 1
fi

NODE_VER=$(node -v 2>/dev/null || echo "unknown")
echo -e "${GREEN}✓ ตรวจพบ Node.js Runtime: ${NODE_VER}${NC}"

# 4. Detect AI tools (8 tools across 3 tiers)
echo ""
echo -e "${GRAY}กำลังตรวจสอบโปรแกรม AI ในเครื่อง Mac (ครอบคลุมทั้ง 3 สาย: สายฟรี, สายจ่ายตังค์, สาย Local AI)...${NC}"

CURSOR_FOUND=false
OPENCODE_FOUND=false
CLAUDE_FOUND=false
CHATGPT_FOUND=false
ANTIGRAVITY_FOUND=false
HERMES_FOUND=false
WINDSURF_FOUND=false
CODEX_FOUND=false

if [ -d "/Applications/Cursor.app" ] || [ -d "$HOME/Applications/Cursor.app" ] || [ -d "$HOME/Library/Application Support/Cursor" ] || [ -d "$HOME/.cursor" ] || command -v cursor >/dev/null 2>&1; then
    CURSOR_FOUND=true
fi

if [ -d "/Applications/OpenCode.app" ] || [ -d "$HOME/Applications/OpenCode.app" ] || [ -d "$HOME/Library/Application Support/OpenCode" ] || [ -d "$HOME/.opencode" ] || command -v opencode >/dev/null 2>&1; then
    OPENCODE_FOUND=true
fi

if [ -d "/Applications/Claude.app" ] || [ -d "$HOME/Applications/Claude.app" ] || [ -d "$HOME/Library/Application Support/Claude" ] || [ -d "$HOME/.claude" ] || [ -d "$HOME/.claude-code" ] || command -v claude >/dev/null 2>&1; then
    CLAUDE_FOUND=true
fi

if [ -d "/Applications/ChatGPT.app" ] || [ -d "$HOME/Applications/ChatGPT.app" ] || [ -d "$HOME/Library/Application Support/ChatGPT" ] || command -v chatgpt >/dev/null 2>&1; then
    CHATGPT_FOUND=true
fi

if [ -d "$HOME/.gemini/antigravity-ide" ] || [ -d "$HOME/.gemini" ] || [ -d "/Applications/Google Antigravity.app" ] || command -v agy >/dev/null 2>&1; then
    ANTIGRAVITY_FOUND=true
fi

if command -v hermes >/dev/null 2>&1 || command -v hermes-agent >/dev/null 2>&1 || [ -d "$HOME/.hermes" ] || [ -d "$HOME/Library/Application Support/hermes" ]; then
    HERMES_FOUND=true
fi

if [ -d "/Applications/Windsurf.app" ] || [ -d "$HOME/Applications/Windsurf.app" ] || [ -d "$HOME/Library/Application Support/Windsurf" ] || [ -d "$HOME/.windsurf" ] || command -v windsurf >/dev/null 2>&1; then
    WINDSURF_FOUND=true
fi

if [ -d "/Applications/Visual Studio Code.app" ] || [ -d "$HOME/Applications/Visual Studio Code.app" ] || [ -d "$HOME/Library/Application Support/Code" ] || [ -d "$HOME/.vscode" ] || command -v code >/dev/null 2>&1; then
    CODEX_FOUND=true
fi

FOUND_COUNT=0
[ "$CURSOR_FOUND" = true ] && FOUND_COUNT=$((FOUND_COUNT + 1))
[ "$OPENCODE_FOUND" = true ] && FOUND_COUNT=$((FOUND_COUNT + 1))
[ "$CLAUDE_FOUND" = true ] && FOUND_COUNT=$((FOUND_COUNT + 1))
[ "$CHATGPT_FOUND" = true ] && FOUND_COUNT=$((FOUND_COUNT + 1))
[ "$ANTIGRAVITY_FOUND" = true ] && FOUND_COUNT=$((FOUND_COUNT + 1))
[ "$HERMES_FOUND" = true ] && FOUND_COUNT=$((FOUND_COUNT + 1))
[ "$WINDSURF_FOUND" = true ] && FOUND_COUNT=$((FOUND_COUNT + 1))
[ "$CODEX_FOUND" = true ] && FOUND_COUNT=$((FOUND_COUNT + 1))

echo -e "${WHITE}ผลการตรวจจับโปรแกรม AI บน macOS:${NC}"
echo -e " ${CYAN}● สายฟรี / มี Quota ฟรี (Free Quota Tier):${NC}"
if [ "$CURSOR_FOUND" = true ]; then echo -e "    [${GREEN}✓${NC}] Cursor IDE                       (พบในเครื่อง - พร้อมใช้งาน)"; else echo -e "    [ ] Cursor IDE                       (ยังไม่พบในเครื่อง)"; fi
if [ "$OPENCODE_FOUND" = true ]; then echo -e "    [${GREEN}✓${NC}] OpenCode AI Assistant            (พบในเครื่อง - พร้อมใช้งาน)"; else echo -e "    [ ] OpenCode AI Assistant            (ยังไม่พบในเครื่อง)"; fi
if [ "$WINDSURF_FOUND" = true ]; then echo -e "    [${GREEN}✓${NC}] Windsurf AI IDE (Codeium)        (พบในเครื่อง - พร้อมใช้งาน)"; else echo -e "    [ ] Windsurf AI IDE (Codeium)        (ยังไม่พบในเครื่อง)"; fi
if [ "$CODEX_FOUND" = true ]; then echo -e "    [${GREEN}✓${NC}] OpenAI Codex / VS Code           (พบในเครื่อง - พร้อมใช้งาน)"; else echo -e "    [ ] OpenAI Codex / VS Code           (ยังไม่พบในเครื่อง)"; fi

echo -e " ${YELLOW}● สายจ่ายตังค์ / องค์กรจัดซื้อ (Paid / Commercial Tier):${NC}"
if [ "$CLAUDE_FOUND" = true ]; then echo -e "    [${GREEN}✓${NC}] Claude Desktop / Claude Code     (พบในเครื่อง - พร้อมใช้งาน)"; else echo -e "    [ ] Claude Desktop / Claude Code     (ยังไม่พบในเครื่อง)"; fi
if [ "$CHATGPT_FOUND" = true ]; then echo -e "    [${GREEN}✓${NC}] ChatGPT Desktop                  (พบในเครื่อง - พร้อมใช้งาน)"; else echo -e "    [ ] ChatGPT Desktop                  (ยังไม่พบในเครื่อง)"; fi
if [ "$ANTIGRAVITY_FOUND" = true ]; then echo -e "    [${GREEN}✓${NC}] Google Antigravity & Spark       (พบในเครื่อง - พร้อมใช้งาน)"; else echo -e "    [ ] Google Antigravity & Spark       (ยังไม่พบในเครื่อง)"; fi

echo -e " ${MAGENTA}● สาย Local AI / ความเป็นส่วนตัวข้อมูลสูงสุด (Local / Privacy Tier):${NC}"
if [ "$HERMES_FOUND" = true ]; then echo -e "    [${GREEN}✓${NC}] Hermes Agent (Nous / Local AI)   (พบในเครื่อง - พร้อมใช้งาน)"; else echo -e "    [ ] Hermes Agent (Nous / Local AI)   (ยังไม่พบในเครื่อง)"; fi

# Zero-Tool Guided Wizard
if [ "$FOUND_COUNT" -eq 0 ]; then
    echo ""
    echo -e "${YELLOW}⚠️  ยังไม่พบโปรแกรม AI ใดๆ ในเครื่อง Mac ของคุณ${NC}"
    echo -e "${GRAY}------------------------------------------------------------${NC}"
    echo -e "${CYAN}🧭 [คำแนะนำการเลือก AI ให้เหมาะกับรูปแบบการทำงานของคุณ]:${NC}"
    echo -e "  1. สายฟรี / มี Quota ฟรี (แนะนำมากที่สุดสำหรับเริ่มต้นใช้งาน — ไม่มีค่าใช้จ่าย):"
    echo -e "     - ⭐ Cursor IDE: เปิดโฟลเดอร์นี้แล้วคุยภาษาไทยได้ทันที มีโควตาฟรี (${CYAN}https://cursor.com${NC})"
    echo -e "     - ⭐ OpenCode: ผู้ช่วย AI ใช้งานง่ายพร้อมโควตาฟรี (${CYAN}https://opencode.ai${NC})"
    echo -e "  2. สายจ่ายตังค์ / องค์กรจัดซื้อ (สำหรับท่านที่มีสิทธิ์ Pro/Plus หรือ License หน่วยงาน):"
    echo -e "     - ChatGPT Desktop / Claude Desktop / Google Antigravity & Spark"
    echo -e "  3. สาย Local AI (สำหรับผู้ต้องการความปลอดภัยข้อมูล 100% ประมวลผลในเครื่อง):"
    echo -e "     - Hermes Agent (pip install hermes-agent)"
    echo -e "  4. ดำเนินการติดตั้ง STeP AI ต่อทันที (ไปดาวน์โหลด AI ภายหลัง)"
    echo -e "${GRAY}------------------------------------------------------------${NC}"

    read -p "ต้องการให้ระบบแนะนำและเปิดหน้าดาวน์โหลดสายฟรีหรือไม่? (พิมพ์ 1 หรือกด Enter) [default: 1]: " GUIDE_CHOICE || true
    GUIDE_CHOICE=${GUIDE_CHOICE:-1}

    if [ "$GUIDE_CHOICE" = "1" ]; then
        echo ""
        echo -e "${CYAN}เลือกโปรแกรมสายฟรีที่ต้องการเปิดหน้าเว็บดาวน์โหลด:${NC}"
        echo -e "  1. Cursor IDE (https://cursor.com) [แนะนำที่สุด]"
        echo -e "  2. OpenCode AI (https://opencode.ai)"
        echo -e "  3. ข้ามไปขั้นตอนติดตั้งต่อ"
        read -p "พิมพ์หมายเลข (1-3) [default: 1]: " DL_CHOICE || true
        DL_CHOICE=${DL_CHOICE:-1}

        if [ "$DL_CHOICE" = "1" ]; then
            echo -e "${GREEN}กำลังเปิดเบราว์เซอร์เพื่อดาวน์โหลด Cursor IDE...${NC}"
            open "https://cursor.com" || true
        elif [ "$DL_CHOICE" = "2" ]; then
            echo -e "${GREEN}กำลังเปิดเบราว์เซอร์เพื่อดาวน์โหลด OpenCode...${NC}"
            open "https://opencode.ai" || true
        fi
    fi
fi

echo ""
echo -e "${GRAY}------------------------------------------------------------${NC}"
echo -e "${YELLOW}ขั้นตอนที่ 1: เลือกเครื่องมือ AI ที่ต้องการติดตั้งคำสั่ง${NC}"
echo -e "  1. ติดตั้งให้ทุกค่าย (All 8 Tools: Cursor, OpenCode, Claude, ChatGPT, Antigravity, Hermes, Windsurf, VS Code) [แนะนำ]"
echo -e "  2. Cursor IDE (สายฟรีมีโควตา)"
echo -e "  3. OpenCode AI Assistant (สายฟรีมีโควตา)"
echo -e "  4. Claude Desktop / Claude Code (สายจ่ายตังค์)"
echo -e "  5. ChatGPT Desktop (สายจ่ายตังค์)"
echo -e "  6. Google Antigravity & Spark (สายจ่ายตังค์)"
echo -e "  7. Hermes Agent (สาย Local AI)"
echo -e "  8. Windsurf AI IDE (สายฟรีมีโควตา)"
echo -e "  9. OpenAI Codex / VS Code (สายฟรีมีโควตา)"
echo ""

read -p "พิมพ์หมายเลข (1-9) [default: 1]: " TOOL_CHOICE || true
TOOL_CHOICE=${TOOL_CHOICE:-1}

SELECTED_TOOL="all"
case "$TOOL_CHOICE" in
    1) SELECTED_TOOL="all" ;;
    2) SELECTED_TOOL="cursor" ;;
    3) SELECTED_TOOL="opencode" ;;
    4) SELECTED_TOOL="claude" ;;
    5) SELECTED_TOOL="chatgpt" ;;
    6) SELECTED_TOOL="antigravity" ;;
    7) SELECTED_TOOL="hermes" ;;
    8) SELECTED_TOOL="windsurf" ;;
    9) SELECTED_TOOL="codex" ;;
    *) SELECTED_TOOL="all" ;;
esac

# 5. เลือก STeP Team (Display all 22 teams)
echo ""
echo -e "${GRAY}------------------------------------------------------------${NC}"
echo -e "${YELLOW}ขั้นตอนที่ 2: เลือกทีมหลักของคุณ (Primary Team — แสดงครบทั้ง 22 ทีม)${NC}"
echo ""
echo -e "${CYAN}● กลุ่มงาน: ธรรมาภิบาลและการบริหารจัดการ (Governance & Operations)${NC}"
echo -e "   1. GA        - งานบริหารทั่วไป (ธุรการกลาง/เอกสาร)"
echo -e "   2. AFP       - บัญชี การเงิน และจัดซื้อ"
echo -e "   3. IASA      - ความร่วมมือระหว่างประเทศและพันธมิตร"
echo -e "   4. QS        - ระบบคุณภาพ (ISO และมาตรฐานองค์กร)"
echo -e "   5. NMCO      - ประสานเครือข่ายอุทยานวิทยาศาสตร์และ อว."
echo -e "   6. HD        - พัฒนาศักยภาพบุคลากร"
echo ""
echo -e "${CYAN}● กลุ่มงาน: บ่มเพาะธุรกิจและยุทธศาสตร์องค์กร (Incubation & Strategy)${NC}"
echo -e "   7. PITI      - บ่มเพาะศักยภาพนวัตกรรมและเทคโนโลยี"
echo -e "   8. ISI       - บ่มเพาะ Startup นวัตกรรม"
echo -e "   9. EIC       - การเป็นผู้ประกอบการและนวัตกรรม"
echo -e "  10. IMO       - บริหารจัดการนวัตกรรม"
echo -e "  11. SIT       - ยุทธศาสตร์ โครงการริเริ่ม และการเปลี่ยนแปลง"
echo ""
echo -e "${CYAN}● กลุ่มงาน: ถ่ายทอดเทคโนโลยีและเชื่อมโยงอุตสาหกรรม (Tech Transfer & Industry)${NC}"
echo -e "  12. TECH-SPIN - ถ่ายทอดเทคโนโลยีและบริษัท Spin-off"
echo -e "  13. TECH-UP   - เทคโนโลยีเชิงลึกและการขยายระดับการผลิต"
echo -e "  14. LINC      - ความร่วมมือท้องถิ่นและอุตสาหกรรม"
echo -e "  15. PUBSEC    - โครงการความร่วมมือภาครัฐ"
echo ""
echo -e "${CYAN}● กลุ่มงาน: การตลาด การสื่อสาร และลูกค้าสัมพันธ์ (Market, Creative & Client)${NC}"
echo -e "  16. CC        - งานสร้างสรรค์และการสื่อสาร"
echo -e "  17. MI        - นวัตกรรมตลาดสำหรับผลิตภัณฑ์นวัตกรรม"
echo -e "  18. CRM       - ลูกค้าสัมพันธ์"
echo ""
echo -e "${CYAN}● กลุ่มงาน: โครงสร้างพื้นฐาน ห้องปฏิบัติการ และโรงงานต้นแบบ (Labs & Infrastructure)${NC}"
echo -e "  19. IFU       - การใช้ประโยชน์พื้นที่และสิ่งอำนวยความสะดวก"
echo -e "  20. IQI       - พัฒนาคุณภาพโครงสร้างพื้นฐาน"
echo -e "  21. LES       - ห้องปฏิบัติการและเครื่องมือ"
echo -e "  22. FOODFABR  - โรงงานต้นแบบผลิตภัณฑ์อาหารนวัตกรรม"
echo ""

read -p "พิมพ์หมายเลขทีม (1-22) หรือ รหัสทีม (เช่น 4 หรือ qs) [default: 4 (QS)]: " TEAM_CHOICE || true
TEAM_CHOICE=${TEAM_CHOICE:-4}

case "$(echo "$TEAM_CHOICE" | tr '[:upper:]' '[:lower:]')" in
    1|ga) SELECTED_TEAM="ga" ;;
    2|afp) SELECTED_TEAM="afp" ;;
    3|iasa) SELECTED_TEAM="iasa" ;;
    4|qs) SELECTED_TEAM="qs" ;;
    5|nmco) SELECTED_TEAM="nmco" ;;
    6|hd) SELECTED_TEAM="hd" ;;
    7|piti) SELECTED_TEAM="piti" ;;
    8|isi) SELECTED_TEAM="isi" ;;
    9|eic) SELECTED_TEAM="eic" ;;
    10|imo) SELECTED_TEAM="imo" ;;
    11|sit) SELECTED_TEAM="sit" ;;
    12|tech-spin|techspin) SELECTED_TEAM="tech-spin" ;;
    13|tech-up|techup) SELECTED_TEAM="tech-up" ;;
    14|linc) SELECTED_TEAM="linc" ;;
    15|pubsec) SELECTED_TEAM="pubsec" ;;
    16|cc) SELECTED_TEAM="cc" ;;
    17|mi) SELECTED_TEAM="mi" ;;
    18|crm) SELECTED_TEAM="crm" ;;
    19|ifu) SELECTED_TEAM="ifu" ;;
    20|iqi) SELECTED_TEAM="iqi" ;;
    21|les) SELECTED_TEAM="les" ;;
    22|foodfabr) SELECTED_TEAM="foodfabr" ;;
    *)
        echo -e "${YELLOW}ไม่พบทีม '$TEAM_CHOICE' ระบบจะใช้ค่าเริ่มต้น: QS (ระบบคุณภาพ)${NC}"
        SELECTED_TEAM="qs"
        ;;
esac

# 6. Install / Configure Harness
echo ""
echo -e "${GRAY}------------------------------------------------------------${NC}"
echo -e "${YELLOW}ขั้นตอนที่ 3: กำลังติดตั้ง STeP AI ให้พร้อมใช้งาน...${NC}"
echo ""

cd "$ROOT_DIR"
node "$ROOT_DIR/bin/step-ai.js" init --team "$SELECTED_TEAM" --tool "$SELECTED_TOOL"
node "$ROOT_DIR/bin/step-ai.js" config --team "$SELECTED_TEAM"

# 7. Run Doctor Check
echo ""
node "$ROOT_DIR/bin/step-ai.js" doctor --employee

echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${YELLOW}                 ✓ STeP AI พร้อมใช้งานบน macOS               ${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo -e "  ทีมหลัก:       ${WHITE}$(echo "$SELECTED_TEAM" | tr '[:lower:]' '[:upper:]')${NC}"
echo -e "  เครื่องมือ AI:  ${WHITE}$SELECTED_TOOL${NC}"
echo -e "  สถาปัตยกรรม:   ${WHITE}$ARCH_DISPLAY${NC}"
echo -e "  ระบบค้นหา:     ${WHITE}Layer 1 Dynamic Router พร้อมใช้งาน${NC}"
echo ""
echo -e "${CYAN}💡 วิธีเริ่มใช้งานบน macOS:${NC}"
echo -e "  1. เปิดโปรแกรม AI ที่คุณเลือก (Cursor, OpenCode, VS Code, Claude Desktop หรือ ChatGPT Desktop)"
echo -e "  2. ในโปรแกรม AI ให้เปิดโฟลเดอร์ระบบ STeP AI นี้ (เมนู File -> Open Folder):"
echo -e "     📁 ${YELLOW}$ROOT_DIR${NC}"
echo -e "  3. เริ่มพิมพ์คุยงานภาษาไทยในช่องแชท AI ได้ทันที เช่น:"
echo -e "     - ${GRAY}'ช่วยตรวจเอกสารนี้ก่อนส่ง'${NC}"
echo -e "     - ${GRAY}'ช่วยตรวจใบเสร็จนี้ว่าเบิกจ่ายตามระเบียบ มช. ได้มั้ย'${NC}"
echo -e "     - ${GRAY}'ช่วยตรวจ TOR จัดซื้อระบบ หน่อยครับ'${NC}"
echo -e "     ${GRAY}(สามารถลากไฟล์งาน Word, PDF หรือ Excel เข้ามาวางในโฟลเดอร์นี้เพื่อให้ AI ช่วยตรวจได้)${NC}"
echo ""
echo -e "${GRAY}  หากต้องการเปลี่ยนทีมในอนาคต: รัน 'step-ai config'${NC}"
echo -e "${GRAY}  หากต้องการอัปเดตเวอร์ชันใหม่: ดับเบิลคลิก Update-STeP-AI.command${NC}"
echo ""
read -p "กด Enter เพื่อเสร็จสิ้น..." dummy
"""

def main():
    ps1_file = ROOT / 'install' / 'install-windows.ps1'
    sh_file = ROOT / 'install' / 'install-macos.sh'

    # Write Windows ps1 with UTF-8 BOM and CRLF
    ps1_bytes = PS1_CONTENT.replace('\r\n', '\n').replace('\n', '\r\n').encode('utf-8-sig')
    with open(ps1_file, 'wb') as f:
        f.write(ps1_bytes)
    print(f"Updated {ps1_file} (UTF-8 BOM, CRLF, {len(ps1_bytes)} bytes)")

    # Write macOS sh with UTF-8 and LF
    sh_bytes = SH_CONTENT.replace('\r\n', '\n').encode('utf-8')
    with open(sh_file, 'wb') as f:
        f.write(sh_bytes)
    print(f"Updated {sh_file} (UTF-8, LF, {len(sh_bytes)} bytes)")

if __name__ == '__main__':
    main()
