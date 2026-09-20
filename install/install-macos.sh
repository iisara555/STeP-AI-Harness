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

# 4. AI application readiness is checked once after installation by doctor --employee.

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
