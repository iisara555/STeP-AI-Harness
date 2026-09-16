from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

PS1_CONTENT = """# STeP AI — Feedback & Task Request (Pilot v0.2)
# อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "STeP AI Feedback & Tasks (Pilot v0.2)"

if (-not $PSScriptRoot) {
    $PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}

$rootDir = Resolve-Path "$PSScriptRoot\\.."
Set-Location $rootDir

Clear-Host
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   ____ _____     ____       _    ___                            " -ForegroundColor Cyan
Write-Host "  / ___|_   _|___|  _ \\     / \\  |_ _|   " -ForegroundColor Cyan -NoNewline
Write-Host "STeP AI Feedback & Tasks        " -ForegroundColor Yellow
Write-Host "  \\___ \\ | | / _ \\ |_) |   / _ \\  | |    " -ForegroundColor Cyan -NoNewline
Write-Host "ศูนย์รับฟังข้อเสนอแนะและงานใหม่  " -ForegroundColor Gray
Write-Host "   ___) || ||  __/  __/   / ___ \\ | |    " -ForegroundColor Cyan -NoNewline
Write-Host "สำหรับพนักงานอุทยานฯ 22 ทีม     " -ForegroundColor Gray
Write-Host "  |____/ |_| \\___|_|     /_/   \\_\\___|                           " -ForegroundColor Cyan
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
        & node "$rootDir\\bin\\step-ai.js" feedback --issue -d "$rootDir"
        $feedbackFile = "$rootDir\\FEEDBACK.md"
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
        & node "$rootDir\\bin\\step-ai.js" feedback --request -d "$rootDir"
        $requestFile = "$rootDir\\REQUEST_NEW_TASK.md"
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
        & node "$rootDir\\bin\\step-ai.js" feedback --admin
    }
    default {
        Write-Host ""
        Write-Host "ปิดโปรแกรมเรียบร้อยแล้ว" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Green
Read-Host "กด Enter เพื่อเสร็จสิ้น"
"""

SH_CONTENT = """#!/usr/bin/env bash
# STeP AI — Feedback & Task Request (macOS)
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
echo -e "${CYAN}  / ___|_   _|___|  _ \\\\     / \\\\  |_ _|   ${YELLOW}STeP AI Feedback & Tasks        ${NC}"
echo -e "${CYAN}  \\\\___ \\\\ | | / _ \\\\ |_) |   / _ \\\\  | |    ${GRAY}ศูนย์รับฟังข้อเสนอแนะและงานใหม่  ${NC}"
echo -e "${CYAN}   ___) || ||  __/  __/   / ___ \\\\ | |    ${GRAY}สำหรับพนักงานอุทยานฯ 22 ทีม     ${NC}"
echo -e "${CYAN}  |____/ |_| \\\\___|_|     /_/   \\\\_\\\\___|                           ${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo -e "${WHITE}   อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP / RSP North) ${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""
echo -e "${YELLOW}ยินดีต้อนรับสู่ศูนย์รับฟังข้อเสนอแนะ STeP AI${NC}"
echo -e "กรุณาเลือกสิ่งที่ท่านต้องการดำเนินการ:"
echo ""
echo -e "  ${CYAN}[1]${NC} AI ตอบไม่ถูก / อยากแจ้งปัญหา"
echo -e "  ${CYAN}[2]${NC} อยากให้ AI ช่วยงานเพิ่ม"
echo -e "  ${GRAY}[0] ปิด${NC}"
echo ""

read -p "พิมพ์หมายเลข (1, 2 หรือ 0): " choice

case "$choice" in
    1)
        echo ""
        echo -e "${GRAY}กำลังเปิดแบบฟอร์มแจ้งปัญหา...${NC}"
        node "$ROOT_DIR/bin/step-ai.js" feedback --issue -d "$ROOT_DIR"
        open -t "$ROOT_DIR/FEEDBACK.md" 2>/dev/null || open "$ROOT_DIR/FEEDBACK.md"
        echo -e "${GREEN}✓ เปิดไฟล์ FEEDBACK.md ให้ท่านเรียบร้อยแล้ว${NC}"
        echo -e "${YELLOW}คำแนะนำ: เมื่อพิมพ์เสร็จแล้วให้กด Save แล้วส่งไฟล์ให้ AI Champion ประจำทีมได้เลยครับ${NC}"
        ;;
    2)
        echo ""
        echo -e "${GRAY}กำลังเปิดแบบฟอร์มของานเพิ่ม...${NC}"
        node "$ROOT_DIR/bin/step-ai.js" feedback --request -d "$ROOT_DIR"
        open -t "$ROOT_DIR/REQUEST_NEW_TASK.md" 2>/dev/null || open "$ROOT_DIR/REQUEST_NEW_TASK.md"
        echo -e "${GREEN}✓ เปิดไฟล์ REQUEST_NEW_TASK.md ให้ท่านเรียบร้อยแล้ว${NC}"
        echo -e "${YELLOW}คำแนะนำ: เมื่อพิมพ์เสร็จแล้วให้ส่งไฟล์ให้หัวหน้าฝ่ายหรือ AI Champion ได้เลยครับ${NC}"
        ;;
    admin)
        echo ""
        node "$ROOT_DIR/bin/step-ai.js" feedback --admin
        ;;
    *)
        echo ""
        echo -e "${GRAY}ปิดโปรแกรมเรียบร้อยแล้ว${NC}"
        ;;
esac

echo ""
echo -e "${GREEN}=================================================================${NC}"
read -p "กด Enter เพื่อเสร็จสิ้น..." dummy
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
