#!/usr/bin/env bash
# STeP AI — Zero-Terminal macOS Installer (Pilot v0.1)
# อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
WHITE='\033[1;37m'
GRAY='\033[0;90m'
RED='\033[0;31m'
NC='\033[0m'

clear || true
echo -e "${CYAN}============================================================${NC}"
echo -e "${YELLOW}               STeP AI Setup (Pilot v0.1)                   ${NC}"
echo -e "${WHITE}   อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP) ${NC}"
echo -e "${CYAN}============================================================${NC}"
echo ""

# 1. Check Node.js Runtime
echo -e "${GRAY}กำลังตรวจสอบสภาพแวดล้อมระบบ macOS...${NC}"
if ! command -v node >/dev/null 2>&1; then
    echo ""
    echo -e "${YELLOW}⚠️  ไม่พบ Node.js ในเครื่องคอมพิวเตอร์ของคุณ${NC}"
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
echo -e "${GREEN}✓ พบ Node.js Runtime: ${NODE_VER}${NC}"

# 2. Detect Installed AI Tools on macOS
echo ""
echo -e "${GRAY}กำลังตรวจสอบโปรแกรม AI ในเครื่อง macOS...${NC}"

CODEX_FOUND=false
CURSOR_FOUND=false
CLAUDE_FOUND=false

if [ -d "/Applications/Visual Studio Code.app" ] || [ -d "$HOME/Applications/Visual Studio Code.app" ] || [ -d "$HOME/Library/Application Support/Code" ] || [ -d "$HOME/.vscode" ]; then
    CODEX_FOUND=true
fi

if [ -d "/Applications/Cursor.app" ] || [ -d "$HOME/Applications/Cursor.app" ] || [ -d "$HOME/Library/Application Support/Cursor" ] || [ -d "$HOME/.cursor" ]; then
    CURSOR_FOUND=true
fi

if [ -d "/Applications/Claude.app" ] || [ -d "$HOME/Applications/Claude.app" ] || [ -d "$HOME/Library/Application Support/Claude" ] || [ -d "$HOME/.claude" ] || [ -d "$HOME/.claude-code" ]; then
    CLAUDE_FOUND=true
fi

echo -e "${WHITE}ผลการตรวจจับเครื่องมือ AI บน macOS:${NC}"
if [ "$CODEX_FOUND" = true ]; then
    echo -e "  [${GREEN}✓${NC}] OpenAI Codex / VS Code"
else
    echo -e "  [ ] OpenAI Codex / VS Code"
fi

if [ "$CURSOR_FOUND" = true ]; then
    echo -e "  [${GREEN}✓${NC}] Cursor IDE"
else
    echo -e "  [ ] Cursor IDE"
fi

if [ "$CLAUDE_FOUND" = true ]; then
    echo -e "  [${GREEN}✓${NC}] Claude Desktop / Claude Code"
else
    echo -e "  [ ] Claude Desktop / Claude Code"
fi

# 3. Choose AI Tool
echo ""
echo -e "${GRAY}------------------------------------------------------------${NC}"
echo -e "${YELLOW}ขั้นตอนที่ 1: เลือกเครื่องมือ AI ที่คุณต้องการติดตั้ง${NC}"
echo -e "  1. ติดตั้งทั้งหมดที่ตรวจพบ (แนะนำ)"
echo -e "  2. OpenAI Codex / VS Code"
echo -e "  3. Cursor IDE"
echo -e "  4. Claude Desktop / Claude Code"
echo ""

read -p "พิมพ์หมายเลข (1-4) [default: 1]: " TOOL_CHOICE || true
TOOL_CHOICE=${TOOL_CHOICE:-1}

SELECTED_TOOL="all"
case "$TOOL_CHOICE" in
    1) SELECTED_TOOL="all" ;;
    2) SELECTED_TOOL="codex" ;;
    3) SELECTED_TOOL="cursor" ;;
    4) SELECTED_TOOL="claude" ;;
    *) SELECTED_TOOL="all" ;;
esac

# 4. Choose Team
echo ""
echo -e "${GRAY}------------------------------------------------------------${NC}"
echo -e "${YELLOW}ขั้นตอนที่ 2: เลือกทีมหลักของคุณ (Primary Team)${NC}"
echo -e "  1. QS   - ระบบบริหารคุณภาพ ISO"
echo -e "  2. AFP  - บัญชี การเงิน และจัดซื้อ"
echo -e "  3. CC   - การสื่อสารองค์กรและการตลาด"
echo -e "  4. MI   - วิเคราะห์ข้อมูลการตลาดและธุรกิจ"
echo -e "  5. PITI - นวัตกรรมสตาร์ทอัพและบ่มเพาะธุรกิจ"
echo -e "${GRAY}  --------------------------------------------------------${NC}"
echo -e "${CYAN}  A. แสดงรายชื่อครบทั้ง 22 ทีมของ STeP${NC}"
echo ""

read -p "พิมพ์หมายเลขทีม (1-5) หรือ 'A' เพื่อดูทั้งหมด [default: 1]: " TEAM_CHOICE || true
TEAM_CHOICE=${TEAM_CHOICE:-1}

SELECTED_TEAM="qs"
if [ "$TEAM_CHOICE" = "A" ] || [ "$TEAM_CHOICE" = "a" ]; then
    echo ""
    node "$ROOT_DIR/bin/step-ai.js" teams
    echo ""
    read -p "พิมพ์รหัสทีมของคุณ (เช่น qs, afp, cc, mi, piti, linc, etc.): " TEAM_CODE_INPUT || true
    if [ -n "$TEAM_CODE_INPUT" ]; then
        SELECTED_TEAM=$(echo "$TEAM_CODE_INPUT" | tr '[:upper:]' '[:lower:]' | xargs)
    fi
else
    case "$TEAM_CHOICE" in
        1) SELECTED_TEAM="qs" ;;
        2) SELECTED_TEAM="afp" ;;
        3) SELECTED_TEAM="cc" ;;
        4) SELECTED_TEAM="mi" ;;
        5) SELECTED_TEAM="piti" ;;
        *) SELECTED_TEAM="qs" ;;
    esac
fi

# 5. Perform Installation
echo ""
echo -e "${GRAY}------------------------------------------------------------${NC}"
echo -e "${YELLOW}ขั้นตอนที่ 3: กำลังติดตั้ง STeP AI ให้พร้อมใช้งาน...${NC}"
echo ""

cd "$ROOT_DIR"

# Run init
node "$ROOT_DIR/bin/step-ai.js" init --team "$SELECTED_TEAM" --tool "$SELECTED_TOOL"

# Run config update
node "$ROOT_DIR/bin/step-ai.js" config --team "$SELECTED_TEAM"

# 6. Run Doctor Check
echo ""
node "$ROOT_DIR/bin/step-ai.js" doctor --employee

# 7. Success Screen
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${YELLOW}                 ✓ STeP AI พร้อมใช้งานบน macOS               ${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo -e "  ทีมหลัก:       ${WHITE}$(echo "$SELECTED_TEAM" | tr '[:lower:]' '[:upper:]')${NC}"
echo -e "  เครื่องมือ AI:  ${WHITE}$SELECTED_TOOL${NC}"
echo -e "  ระบบค้นหา:     ${WHITE}Layer 1 Dynamic Router พร้อมใช้งาน${NC}"
echo ""
echo -e "${CYAN}💡 วิธีเริ่มใช้งานบน macOS:${NC}"
echo -e "  1. เปิดโปรแกรม AI ที่คุณเลือก (Cursor, VS Code หรือ Claude Desktop)"
echo -e "  2. เปิดโฟลเดอร์นี้ หรือเริ่มพิมพ์คุยงานภาษาไทยได้ทันที เช่น:"
echo -e "     - ${GRAY}'ช่วยตรวจเอกสารนี้ก่อนส่ง'${NC}"
echo -e "     - ${GRAY}'ช่วยตรวจใบเสร็จนี้ว่าเบิกจ่ายตามระเบียบ มช. ได้มั้ย'${NC}"
echo -e "     - ${GRAY}'ช่วยตรวจ TOR จัดซื้อระบบ หน่อยครับ'${NC}"
echo ""
echo -e "${GRAY}  หากต้องการเปลี่ยนทีมในอนาคต: รัน 'step-ai config'${NC}"
echo -e "${GRAY}  หากต้องการอัปเดตเวอร์ชันใหม่: ดับเบิลคลิก Update-STeP-AI.command${NC}"
echo ""
read -p "กด Enter เพื่อเสร็จสิ้น..." dummy
