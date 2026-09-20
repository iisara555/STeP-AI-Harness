#!/usr/bin/env bash
# STeP AI — Feedback & Task Request (macOS)
# อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=macos-runtime.sh
. "$SCRIPT_DIR/macos-runtime.sh"

if ! resolve_step_node "$ROOT_DIR"; then
    echo "ไม่สามารถเตรียม Node.js Runtime ได้ กรุณาเปิด SUPPORT.md แล้วส่งภาพหน้าจอตามช่องทางช่วยเหลือที่ระบุ"
    read -p "กด Enter เพื่อออก..." dummy
    exit 1
fi
NODE_BIN="$STEP_NODE_BIN"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
WHITE='\033[1;37m'
GRAY='\033[0;90m'
NC='\033[0m'

clear || true
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   ____ _____     ____       _    ___                            ${NC}"
echo -e "${CYAN}  / ___|_   _|___|  _ \\     / \\  |_ _|   ${YELLOW}STeP AI Feedback & Tasks        ${NC}"
echo -e "${CYAN}  \\___ \\ | | / _ \\ |_) |   / _ \\  | |    ${GRAY}ศูนย์รับฟังข้อเสนอแนะและงานใหม่  ${NC}"
echo -e "${CYAN}   ___) || ||  __/  __/   / ___ \\ | |    ${GRAY}สำหรับพนักงานอุทยานฯ 22 ทีม     ${NC}"
echo -e "${CYAN}  |____/ |_| \\___|_|     /_/   \\_\\___|                           ${NC}"
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
        "$NODE_BIN" "$ROOT_DIR/bin/step-ai.js" feedback --issue -d "$ROOT_DIR"
        open -t "$ROOT_DIR/FEEDBACK.md" 2>/dev/null || open "$ROOT_DIR/FEEDBACK.md"
        echo -e "${GREEN}✓ เปิดไฟล์ FEEDBACK.md ให้ท่านเรียบร้อยแล้ว${NC}"
        echo -e "${YELLOW}คำแนะนำ: เมื่อพิมพ์เสร็จแล้วให้กด Save แล้วส่งให้หัวหน้าทีมหรือผู้ประสานงานทีมตาม SUPPORT.md${NC}"
        ;;
    2)
        echo ""
        echo -e "${GRAY}กำลังเปิดแบบฟอร์มของานเพิ่ม...${NC}"
        "$NODE_BIN" "$ROOT_DIR/bin/step-ai.js" feedback --request -d "$ROOT_DIR"
        open -t "$ROOT_DIR/REQUEST_NEW_TASK.md" 2>/dev/null || open "$ROOT_DIR/REQUEST_NEW_TASK.md"
        echo -e "${GREEN}✓ เปิดไฟล์ REQUEST_NEW_TASK.md ให้ท่านเรียบร้อยแล้ว${NC}"
        echo -e "${YELLOW}คำแนะนำ: เมื่อพิมพ์เสร็จแล้วให้ส่งให้หัวหน้าทีมหรือผู้ประสานงานทีมตาม SUPPORT.md${NC}"
        ;;
    admin)
        echo ""
        "$NODE_BIN" "$ROOT_DIR/bin/step-ai.js" feedback --admin
        ;;
    *)
        echo ""
        echo -e "${GRAY}ปิดโปรแกรมเรียบร้อยแล้ว${NC}"
        ;;
esac

echo ""
echo -e "${GREEN}=================================================================${NC}"
read -p "กด Enter เพื่อเสร็จสิ้น..." dummy
