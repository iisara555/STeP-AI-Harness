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

# No approved AI tool detected: continue Harness install but do not open external signup/download pages.
if [ "$FOUND_COUNT" -eq 0 ]; then
    echo ""
    echo -e "${YELLOW}⚠️  ยังไม่พบโปรแกรม AI ที่องค์กรอนุมัติในเครื่องนี้${NC}"
    echo -e "${GRAY}ติดตั้ง STeP AI ต่อได้ แต่ก่อนใช้งานให้ติดต่อ AI Champion เพื่อยืนยันโปรแกรม AI ที่ใช้ได้${NC}"
    echo -e "${GRAY}ระบบจะไม่เปิดเว็บสมัครหรือดาวน์โหลดโปรแกรม AI ให้โดยอัตโนมัติ${NC}"
fi

echo ""
echo -e "${GRAY}------------------------------------------------------------${NC}"
echo -e "${YELLOW}ตั้งค่าการใช้งาน: เลือกกลุ่มงาน/ทีม (ข้ามได้)${NC}"
echo -e "${GRAY}ระบบจะเตรียม instruction สำหรับ AI adapters ที่รองรับทั้งหมดโดยอัตโนมัติ${NC}"
echo -e "${GRAY}ถ้ายังไม่แน่ใจ ให้เลือก 0 ได้ และเปลี่ยนภายหลังด้วย step-ai config${NC}"
echo ""

cd "$ROOT_DIR"
"$NODE_BIN" "$ROOT_DIR/bin/step-ai.js" init --tool all

# 7. Run Doctor Check
echo ""
"$NODE_BIN" "$ROOT_DIR/bin/step-ai.js" doctor --employee

echo ""
echo -e "${GREEN}✓ ตรวจระบบเสร็จแล้ว — ใช้คำแนะนำเริ่มงานที่แสดงจาก STeP AI ด้านบน${NC}"
echo -e "${GRAY}อัปเดตเวอร์ชันใหม่: ดับเบิลคลิก Update-STeP-AI.command${NC}"
echo ""
read -p "กด Enter เพื่อเสร็จสิ้น..." dummy
