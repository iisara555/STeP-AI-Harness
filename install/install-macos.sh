#!/usr/bin/env bash
# STeP AI — Zero-Terminal macOS Installer
# อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=macos-runtime.sh
. "$SCRIPT_DIR/macos-runtime.sh"
PILOT_VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$ROOT_DIR/package.json" | head -n 1)"
PILOT_VERSION="${PILOT_VERSION:-unknown}"

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
WHITE='\033[1;37m'
GRAY='\033[0;90m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
NC='\033[0m'

clear || true
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   ____ _____     ____       _    ___                            ${NC}"
echo -e "${CYAN}  / ___|_   _|___|  _ \     / \  |_ _|   ${YELLOW}STeP AI Setup (v${PILOT_VERSION})      ${NC}"
echo -e "${CYAN}  \___ \ | | / _ \ |_) |   / _ \  | |    ${GRAY}Enterprise AI Architecture      ${NC}"
echo -e "${CYAN}   ___) || ||  __/  __/   / ___ \ | |    ${GRAY}22 Teams • 5 Clusters           ${NC}"
echo -e "${CYAN}  |____/ |_| \___|_|     /_/   \_\___|                           ${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo -e "${WHITE}   อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP / RSP North) ${NC}"
echo -e "${CYAN}=================================================================${NC}"
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

# 3. Resolve required runtime (Node.js >= 20)
echo -e "${GRAY}กำลังตรวจสอบ Node.js runtime...${NC}"
if ! resolve_step_node "$ROOT_DIR"; then
    echo ""
    echo -e "${RED}⚠️  ไม่สามารถเตรียม Node.js Runtime ได้${NC}"
    echo -e "${GRAY}กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่ หรือส่งภาพหน้าจอนี้ให้ AI Champion${NC}"
    echo ""
    read -p "กด Enter เพื่อออกจากโปรแกรม..." dummy
    exit 1
fi

NODE_BIN="$STEP_NODE_BIN"
NODE_VER="$("$NODE_BIN" -v 2>/dev/null || echo "unknown")"
echo -e "${GREEN}✓ Node.js Runtime พร้อมใช้งาน: ${NODE_VER}${NC}"

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
    echo -e "     - เลือกสายฟรีหนึ่งตัวที่โหลดง่ายในเครื่องคุณ: Cursor หรือ OpenCode"
    echo -e "       Cursor: ${CYAN}https://cursor.com${NC}  |  OpenCode: ${CYAN}https://opencode.ai${NC}"
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
        echo -e "  1. Cursor (สายฟรี) https://cursor.com"
        echo -e "  2. OpenCode (สายฟรี) https://opencode.ai"
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

read -p "พิมพ์หมายเลขทีม (1-22) หรือรหัสทีม (เช่น ga, cc) [default: ทุกคนเข้าถึงได้]: " TEAM_CHOICE || true
TEAM_CHOICE=$(echo "$TEAM_CHOICE" | tr '[:upper:]' '[:lower:]')

SELECTED_TEAM=""
if [ -n "$TEAM_CHOICE" ]; then
case "$TEAM_CHOICE" in
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
        echo -e "${YELLOW}ไม่พบทีม '$TEAM_CHOICE' ระบบจะติดตั้งแบบทุกคนเข้าถึงได้${NC}"
        SELECTED_TEAM=""
        ;;
esac
fi

# 6. Install / Configure Harness
echo ""
echo -e "${GRAY}------------------------------------------------------------${NC}"
echo -e "${YELLOW}ขั้นตอนที่ 3: กำลังติดตั้ง STeP AI ให้พร้อมใช้งาน...${NC}"
echo ""

cd "$ROOT_DIR"
if [ -n "$SELECTED_TEAM" ]; then
    "$NODE_BIN" "$ROOT_DIR/bin/step-ai.js" init --team "$SELECTED_TEAM" --tool "$SELECTED_TOOL"
    "$NODE_BIN" "$ROOT_DIR/bin/step-ai.js" config --team "$SELECTED_TEAM"
else
    "$NODE_BIN" "$ROOT_DIR/bin/step-ai.js" init --role all --tool "$SELECTED_TOOL"
fi

# 7. Run Doctor Check
echo ""
"$NODE_BIN" "$ROOT_DIR/bin/step-ai.js" doctor --employee

TEAM_LABEL="$SELECTED_TEAM"
if [ -z "$SELECTED_TEAM" ]; then
    TEAM_LABEL="ทุกคนเข้าถึงได้"
else
    TEAM_LABEL=$(echo "$SELECTED_TEAM" | tr '[:lower:]' '[:upper:]')
fi
echo ""
echo -e "${GREEN}=================================================================${NC}"
echo -e "${YELLOW}                 ✓ STeP AI พร้อมใช้งานบน macOS               ${NC}"
echo -e "${GREEN}=================================================================${NC}"
echo ""
echo -e "  ทีม: ${WHITE}${TEAM_LABEL}${NC}"
echo ""
echo -e "${CYAN}วิธีเริ่มใช้งาน:${NC}"
echo -e "  1. เปิดโปรแกรม AI ที่คุณใช้อยู่ (สายฟรี เช่น Cursor หรือ OpenCode หรือโปรแกรมที่หน่วยงานมีสิทธิ์)"
echo -e "  2. เปิดโฟลเดอร์นี้ในโปรแกรมนั้น:"
echo -e "     ${YELLOW}$ROOT_DIR${NC}"
echo -e "  3. พิมพ์ถามงานภาษาไทยในแชท เช่น 'ช่วยตรวจเอกสารนี้ก่อนส่ง'"
echo ""
echo -e "${GRAY}  อ่านไฟล์ START-HERE.md ในโฟลเดอร์นี้ถ้าไม่แน่ใจว่าจะเริ่มอย่างไร${NC}"
echo -e "${GRAY}  อัปเดตเวอร์ชันใหม่: ดับเบิลคลิก Update-STeP-AI.command${NC}"
echo ""
read -p "กด Enter เพื่อเสร็จสิ้น..." dummy
