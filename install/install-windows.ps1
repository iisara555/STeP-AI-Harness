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
    Write-Host "=================================================================" -ForegroundColor Cyan
    Write-Host "   ____ _____     ____       _    ___                            " -ForegroundColor Cyan
    Write-Host "  / ___|_   _|___|  _ \     / \  |_ _|   " -ForegroundColor Cyan -NoNewline
    Write-Host "STeP AI Setup (Pilot v0.2)      " -ForegroundColor Yellow
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
    Write-Host "⚠️  เครื่องนี้ยังไม่พร้อมติดตั้ง" -ForegroundColor Yellow
    Write-Host "กรุณาติดต่อ AI Champion ประจำทีมให้ช่วยติดตั้งให้ ไม่ต้องติดตั้งโปรแกรมระบบด้วยตัวเอง" -ForegroundColor Gray
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

# Zero-Tool Guided Wizard
if ($foundCount -eq 0) {
    Write-Host ""
    Write-Host "⚠️  ยังไม่พบโปรแกรม AI ใดๆ ในเครื่องคอมพิวเตอร์ของคุณ" -ForegroundColor Yellow
    Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "🧭 [คำแนะนำการเลือก AI ให้เหมาะกับรูปแบบการทำงานของคุณ]:" -ForegroundColor Cyan
    Write-Host "  1. สายฟรี / มี Quota ฟรี  (แนะนำมากที่สุดสำหรับเริ่มต้นใช้งาน — ไม่มีค่าใช้จ่าย):" -ForegroundColor White
    Write-Host "     - เลือกสายฟรีหนึ่งตัวที่โหลดง่ายในเครื่องคุณ: Cursor หรือ OpenCode" -ForegroundColor Gray
    Write-Host "       Cursor: https://cursor.com  |  OpenCode: https://opencode.ai" -ForegroundColor Gray
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
        Write-Host "  1. Cursor (สายฟรี) https://cursor.com" -ForegroundColor White
        Write-Host "  2. OpenCode (สายฟรี) https://opencode.ai" -ForegroundColor White
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

$teamChoice = Read-Host "พิมพ์หมายเลขทีม (1-22) หรือรหัสทีม (เช่น ga, cc) [default: ทุกคนเข้าถึงได้]"
if ([string]::IsNullOrWhiteSpace($teamChoice)) {
    $selectedTeam = ""
} else {
    $normalizedTeam = $teamChoice.Trim().ToLower()
    if ($teamMap.ContainsKey($normalizedTeam)) {
        $selectedTeam = $teamMap[$normalizedTeam]
    } else {
        Write-Host "ไม่พบทีม '$teamChoice' ระบบจะติดตั้งแบบทุกคนเข้าถึงได้" -ForegroundColor Yellow
        $selectedTeam = ""
    }
}

# 4. Perform Installation
Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "ขั้นตอนที่ 3: กำลังติดตั้ง STeP AI ให้พร้อมใช้งาน..." -ForegroundColor Yellow
Write-Host ""

$rootDir = Resolve-Path "$PSScriptRoot\.."
Set-Location $rootDir

if ($selectedTeam) {
    & node "$rootDir\bin\step-ai.js" init --team $selectedTeam --tool $selectedTool
} else {
    & node "$rootDir\bin\step-ai.js" init --role all --tool $selectedTool
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "เกิดข้อผิดพลาดในการติดตั้ง กรุณาติดต่อ AI Champion ประจำทีม" -ForegroundColor Red
    Read-Host "กด Enter เพื่อออก"
    exit 1
}

if ($selectedTeam) {
    & node "$rootDir\bin\step-ai.js" config --team $selectedTeam
}

# 5. Run Doctor Check
Write-Host ""
& node "$rootDir\bin\step-ai.js" doctor --employee

# 6. Success Screen
$teamLabel = if ($selectedTeam) { $selectedTeam.ToUpper() } else { "ทุกคนเข้าถึงได้" }
Write-Host "=================================================================" -ForegroundColor Green
Write-Host "                 ✓ STeP AI พร้อมใช้งาน                      " -ForegroundColor Yellow
Write-Host "=================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  ทีม: $teamLabel" -ForegroundColor White
Write-Host ""
Write-Host "วิธีเริ่มใช้งาน:" -ForegroundColor Cyan
Write-Host "  1. เปิดโปรแกรม AI ที่คุณใช้อยู่ (สายฟรี เช่น Cursor หรือ OpenCode หรือโปรแกรมที่หน่วยงานมีสิทธิ์)" -ForegroundColor White
Write-Host "  2. เปิดโฟลเดอร์นี้ในโปรแกรมนั้น:" -ForegroundColor White
Write-Host "     $rootDir" -ForegroundColor Yellow
Write-Host "  3. พิมพ์ถามงานภาษาไทยในแชท เช่น 'ช่วยตรวจเอกสารนี้ก่อนส่ง'" -ForegroundColor White
Write-Host ""
Write-Host "  อ่านไฟล์ START-HERE.md ในโฟลเดอร์นี้ถ้าไม่แน่ใจว่าจะเริ่มอย่างไร" -ForegroundColor DarkGray
Write-Host "  อัปเดตเวอร์ชันใหม่: ดับเบิลคลิก Update-STeP-AI.bat" -ForegroundColor DarkGray
Write-Host "=================================================================" -ForegroundColor Green
Write-Host ""

Read-Host "กด Enter เพื่อเสร็จสิ้นการติดตั้ง"
