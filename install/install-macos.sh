#!/usr/bin/env bash
# STeP AI — Zero-Terminal macOS Installer (Pilot v0.2)
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

# 4. Detect AI tools
echo ""
echo -e "${GRAY}กำลังตรวจสอบโปรแกรม AI ในเครื่อง Mac...${NC}"

CURSOR_FOUND=false
CODEX_FOUND=false
CLAUDE_FOUND=false
HERMES_FOUND=false
WINDSURF_FOUND=false

if [ -d "/Applications/Cursor.app" ] || [ -d "$HOME/Applications/Cursor.app" ] || [ -d "$HOME/Library/Application Support/Cursor" ] || [ -d "$HOME/.cursor" ] || command -v cursor >/dev/null 2>&1; then
    CURSOR_FOUND=true
fi

if [ -d "/Applications/Visual Studio Code.app" ] || [ -d "$HOME/Applications/Visual Studio Code.app" ] || [ -d "$HOME/Library/Application Support/Code" ] || [ -d "$HOME/.vscode" ] || command -v code >/dev/null 2>&1 || command -v codex >/dev/null 2>&1; then
    CODEX_FOUND=true
fi

if [ -d "/Applications/Claude.app" ] || [ -d "$HOME/Applications/Claude.app" ] || [ -d "$HOME/Library/Application Support/Claude" ] || [ -d "$HOME/.claude" ] || [ -d "$HOME/.claude-code" ] || command -v claude >/dev/null 2>&1; then
    CLAUDE_FOUND=true
fi

if command -v hermes >/dev/null 2>&1 || command -v hermes-agent >/dev/null 2>&1 || [ -d "$HOME/.hermes" ] || [ -d "$HOME/Library/Application Support/hermes" ]; then
    HERMES_FOUND=true
fi

if [ -d "/Applications/Windsurf.app" ] || [ -d "$HOME/Applications/Windsurf.app" ] || [ -d "$HOME/Library/Application Support/Windsurf" ] || [ -d "$HOME/.windsurf" ] || command -v windsurf >/dev/null 2>&1; then
    WINDSURF_FOUND=true
fi

FOUND_COUNT=0
[ "$CURSOR_FOUND" = true ] && FOUND_COUNT=$((FOUND_COUNT + 1))
[ "$CODEX_FOUND" = true ] && FOUND_COUNT=$((FOUND_COUNT + 1))
[ "$CLAUDE_FOUND" = true ] && FOUND_COUNT=$((FOUND_COUNT + 1))
[ "$HERMES_FOUND" = true ] && FOUND_COUNT=$((FOUND_COUNT + 1))
[ "$WINDSURF_FOUND" = true ] && FOUND_COUNT=$((FOUND_COUNT + 1))

echo -e "${WHITE}ผลการตรวจจับโปรแกรม AI บน macOS:${NC}"
if [ "$CURSOR_FOUND" = true ]; then
    echo -e "  [${GREEN}✓${NC}] Cursor IDE                       (พบในเครื่อง - พร้อมใช้งาน)"
else
    echo -e "  [ ] Cursor IDE                       (ยังไม่พบในเครื่อง)"
fi

if [ "$CODEX_FOUND" = true ]; then
    echo -e "  [${GREEN}✓${NC}] OpenAI Codex / VS Code           (พบในเครื่อง - พร้อมใช้งาน)"
else
    echo -e "  [ ] OpenAI Codex / VS Code           (ยังไม่พบในเครื่อง)"
fi

if [ "$CLAUDE_FOUND" = true ]; then
    echo -e "  [${GREEN}✓${NC}] Claude Desktop / Claude Code     (พบในเครื่อง - พร้อมใช้งาน)"
else
    echo -e "  [ ] Claude Desktop / Claude Code     (ยังไม่พบในเครื่อง)"
fi

if [ "$HERMES_FOUND" = true ]; then
    echo -e "  [${GREEN}✓${NC}] Hermes Agent (Nous / Local AI)   (พบในเครื่อง - พร้อมใช้งาน)"
else
    echo -e "  [ ] Hermes Agent (Nous / Local AI)   (ยังไม่พบในเครื่อง)"
fi

if [ "$WINDSURF_FOUND" = true ]; then
    echo -e "  [${GREEN}✓${NC}] Windsurf AI IDE (Codeium)        (พบในเครื่อง - พร้อมใช้งาน)"
else
    echo -e "  [ ] Windsurf AI IDE (Codeium)        (ยังไม่พบในเครื่อง)"
fi

if [ "$FOUND_COUNT" -eq 0 ]; then
    echo ""
    echo -e "${YELLOW}⚠️  ยังไม่พบโปรแกรม AI ใดๆ ในเครื่องคอมพิวเตอร์ของคุณ${NC}"
    echo -e "${GRAY}------------------------------------------------------------${NC}"
    echo -e "${CYAN}💡 แนะนำโปรแกรม AI ฟรีสำหรับพนักงาน STeP:${NC}"
    echo -e "  1. ⭐ Cursor IDE (แนะนำที่สุดสำหรับพนักงานทั่วไป):"
    echo -e "     ดาวน์โหลดได้ฟรีที่: ${CYAN}https://cursor.com${NC}"
    echo -e "     - ใช้งานง่ายที่สุด เพียงเปิดโฟลเดอร์นี้แล้วเริ่มพิมพ์คุยได้ทันที"
    echo -e "  2. 📄 Claude Desktop (เหมาะสำหรับงานเอกสาร/ตรวจภาษาไทย):"
    echo -e "     ดาวน์โหลดได้ฟรีที่: ${CYAN}https://claude.ai/download${NC}"
    echo -e "  3. 🛡️ Hermes Agent (สำหรับ Local AI และความเป็นส่วนตัวข้อมูลสูงสุด):"
    echo -e "     ดูข้อมูลและติดตั้ง: ${CYAN}https://github.com/NousResearch/Hermes-Agent${NC}"
    echo -e "     หรือรันคำสั่ง: pip install hermes-agent"
    echo -e "  4. 💻 VS Code:"
    echo -e "     ดาวน์โหลดได้ฟรีที่: ${CYAN}https://code.visualstudio.com${NC}"
    echo -e "${GRAY}------------------------------------------------------------${NC}"
    echo -e "${GRAY}(คุณสามารถเลือกติดตั้ง STeP AI ต่อได้ทันที เมื่อดาวน์โหลดโปรแกรม AI แล้วจะพร้อมใช้งานทันที)${NC}"
fi

echo ""
echo -e "${GRAY}------------------------------------------------------------${NC}"
echo -e "${YELLOW}ขั้นตอนที่ 1: เลือกเครื่องมือ AI ที่ต้องการติดตั้งคำสั่ง${NC}"
echo -e "  1. ติดตั้งให้ทุกค่าย (All: Cursor, VS Code, Claude, Hermes, Windsurf) [แนะนำ]"
echo -e "  2. Cursor IDE"
echo -e "  3. OpenAI Codex / VS Code"
echo -e "  4. Claude Desktop / Claude Code"
echo -e "  5. Hermes Agent (Nous Research / Local AI)"
echo -e "  6. Windsurf AI IDE"
echo ""

read -p "พิมพ์หมายเลข (1-6) [default: 1]: " TOOL_CHOICE || true
TOOL_CHOICE=${TOOL_CHOICE:-1}

SELECTED_TOOL="all"
case "$TOOL_CHOICE" in
    1) SELECTED_TOOL="all" ;;
    2) SELECTED_TOOL="cursor" ;;
    3) SELECTED_TOOL="codex" ;;
    4) SELECTED_TOOL="claude" ;;
    5) SELECTED_TOOL="hermes" ;;
    6) SELECTED_TOOL="windsurf" ;;
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
echo -e "  1. เปิดโปรแกรม AI ที่คุณเลือก (Cursor, VS Code หรือ Claude Desktop)"
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
