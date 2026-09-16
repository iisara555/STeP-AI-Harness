from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

PS1_CONTENT = """# STeP AI — Feedback & Skill Contribution (Pilot v0.2)
# อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "STeP AI Feedback & Skills (Pilot v0.2)"

if (-not $PSScriptRoot) {
    $PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}

$rootDir = Resolve-Path "$PSScriptRoot\\.."
Set-Location $rootDir

Clear-Host
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   ____ _____     ____       _    ___                            " -ForegroundColor Cyan
Write-Host "  / ___|_   _|___|  _ \\     / \\  |_ _|   " -ForegroundColor Cyan -NoNewline
Write-Host "STeP AI Feedback & Skills       " -ForegroundColor Yellow
Write-Host "  \\___ \\ | | / _ \\ |_) |   / _ \\  | |    " -ForegroundColor Cyan -NoNewline
Write-Host "ศูนย์รับฟังและร่วมพัฒนาทักษะ     " -ForegroundColor Gray
Write-Host "   ___) || ||  __/  __/   / ___ \\ | |    " -ForegroundColor Cyan -NoNewline
Write-Host "สำหรับพนักงานอุทยานฯ 22 ทีม     " -ForegroundColor Gray
Write-Host "  |____/ |_| \\___|_|     /_/   \\_\\___|                           " -ForegroundColor Cyan
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
        & node "$rootDir\\bin\\step-ai.js" feedback --template -d "$rootDir"
        $feedbackFile = "$rootDir\\FEEDBACK.md"
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
        & node "$rootDir\\bin\\step-ai.js" feedback --propose -d "$rootDir"
        $proposeFile = "$rootDir\\SKILL_PROPOSAL_TEMPLATE.md"
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
        Start-Process "explorer.exe" "$rootDir\\skills"
        Write-Host "✓ เปิดโฟลเดอร์เรียบร้อยแล้ว ท่านสามารถดูหรือแก้ไขไฟล์ทักษะได้โดยตรง" -ForegroundColor Green
    }
    "4" {
        Write-Host ""
        Write-Host "กำลังเปิดหน้าเว็บส่งข้อเสนอแนะออนไลน์ในเบราว์เซอร์..." -ForegroundColor Gray
        & node "$rootDir\\bin\\step-ai.js" feedback --open
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
"""

SH_CONTENT = """#!/usr/bin/env bash
# STeP AI — Feedback & Skill Contribution (macOS)
# อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

CYAN='\\033[0;36m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
WHITE='\\033[1;37m'
GRAY='\\033[0;90m'
NC='\\033[0m'

clear || true
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   ____ _____     ____       _    ___                            ${NC}"
echo -e "${CYAN}  / ___|_   _|___|  _ \\\\     / \\\\  |_ _|   ${YELLOW}STeP AI Feedback & Skills       ${NC}"
echo -e "${CYAN}  \\\\___ \\\\ | | / _ \\\\ |_) |   / _ \\\\  | |    ${GRAY}ศูนย์รับฟังและร่วมพัฒนาทักษะ     ${NC}"
echo -e "${CYAN}   ___) || ||  __/  __/   / ___ \\\\ | |    ${GRAY}สำหรับพนักงานอุทยานฯ 22 ทีม     ${NC}"
echo -e "${CYAN}  |____/ |_| \\\\___|_|     /_/   \\\\_\\\\___|                           ${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo -e "${WHITE}   อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP / RSP North) ${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""
echo -e "${YELLOW}ยินดีต้อนรับสู่ศูนย์รับฟังความคิดเห็นและร่วมเสนอทักษะใหม่สำหรับพนักงาน STeP${NC}"
echo -e "ท่านสามารถเลือกสิ่งที่ต้องการดำเนินการได้ดังนี้:"
echo ""
echo -e "  ${CYAN}[1]${NC} แจ้งข้อเสนอแนะ / แจ้งเมื่อ AI ตอบผิด (เปิดไฟล์แบบฟอร์มใน TextEdit ทันที)"
echo -e "  ${CYAN}[2]${NC} เสนอคู่มือหรือทักษะใหม่ของทีม (เปิดไฟล์โครงร่าง Skill ใน TextEdit ทันที)"
echo -e "  ${CYAN}[3]${NC} เปิดโฟลเดอร์ทักษะงาน (เปิดโฟลเดอร์ skills ใน Finder)"
echo -e "  ${CYAN}[4]${NC} เปิดหน้าเว็บส่งข้อเสนอแนะออนไลน์ผ่านเบราว์เซอร์"
echo -e "  ${GRAY}[0] ออกจากโปรแกรม${NC}"
echo ""

read -p "กรุณาพิมพ์หมายเลขที่ต้องการ (1, 2, 3, 4 หรือ 0): " choice

case "$choice" in
    1)
        echo ""
        echo -e "${GRAY}กำลังสร้างแบบฟอร์มส่งข้อเสนอแนะ...${NC}"
        node "$ROOT_DIR/bin/step-ai.js" feedback --template -d "$ROOT_DIR"
        open -t "$ROOT_DIR/FEEDBACK.md" 2>/dev/null || open "$ROOT_DIR/FEEDBACK.md"
        echo -e "${GREEN}✓ เปิดไฟล์ FEEDBACK.md ให้ท่านเรียบร้อยแล้ว${NC}"
        echo -e "${YELLOW}คำแนะนำ: กรอกข้อมูลในไฟล์ FEEDBACK.md แล้วส่งให้ AI Champion ประจำทีม หรือส่งในห้องแชทกลางได้เลยครับ${NC}"
        ;;
    2)
        echo ""
        echo -e "${GRAY}กำลังสร้างเทมเพลตเสนอทักษะใหม่...${NC}"
        node "$ROOT_DIR/bin/step-ai.js" feedback --propose -d "$ROOT_DIR"
        open -t "$ROOT_DIR/SKILL_PROPOSAL_TEMPLATE.md" 2>/dev/null || open "$ROOT_DIR/SKILL_PROPOSAL_TEMPLATE.md"
        echo -e "${GREEN}✓ เปิดไฟล์ SKILL_PROPOSAL_TEMPLATE.md ให้ท่านเรียบร้อยแล้ว${NC}"
        echo -e "${YELLOW}คำแนะนำ: กรอกรายละเอียดทักษะแล้วส่งให้ Domain Lead (หัวหน้าฝ่ายที่เกี่ยวข้อง) เพื่อตรวจความถูกต้องก่อนครับ${NC}"
        ;;
    3)
        echo ""
        echo -e "${GRAY}กำลังเปิดโฟลเดอร์ skills ใน Finder...${NC}"
        open "$ROOT_DIR/skills"
        echo -e "${GREEN}✓ เปิดโฟลเดอร์เรียบร้อยแล้ว${NC}"
        ;;
    4)
        echo ""
        echo -e "${GRAY}กำลังเปิดหน้าเว็บในเบราว์เซอร์...${NC}"
        node "$ROOT_DIR/bin/step-ai.js" feedback --open
        echo -e "${GREEN}✓ เปิดหน้าเว็บเรียบร้อยแล้ว${NC}"
        ;;
    *)
        echo ""
        echo -e "${GRAY}ออกจากโปรแกรมเรียบร้อยแล้ว${NC}"
        ;;
esac

echo ""
echo -e "${GREEN}=================================================================${NC}"
read -p "กด Enter เพื่อปิดหน้าต่างนี้..." dummy
"""

def main():
    ps1_path = ROOT / "install" / "feedback-windows.ps1"
    sh_path = ROOT / "install" / "feedback-macos.sh"

    ps1_bytes = PS1_CONTENT.replace('\r\n', '\n').replace('\n', '\r\n').encode('utf-8-sig')
    with open(ps1_path, 'wb') as f:
        f.write(ps1_bytes)
    print(f"Generated {ps1_path} (UTF-8 BOM, CRLF, {len(ps1_bytes)} bytes)")

    sh_bytes = SH_CONTENT.replace('\r\n', '\n').encode('utf-8')
    with open(sh_path, 'wb') as f:
        f.write(sh_bytes)
    print(f"Generated {sh_path} (UTF-8, LF, {len(sh_bytes)} bytes)")

if __name__ == "__main__":
    main()
