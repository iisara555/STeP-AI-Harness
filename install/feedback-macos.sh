#!/usr/bin/env bash
# STeP AI — Feedback & Skill Contribution (macOS)
# อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
WHITE='\033[1;37m'
GRAY='\033[0;90m'
NC='\033[0m'

clear || true
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}   ____ _____     ____       _    ___                            ${NC}"
echo -e "${CYAN}  / ___|_   _|___|  _ \\     / \\  |_ _|   ${YELLOW}STeP AI Feedback & Skills       ${NC}"
echo -e "${CYAN}  \\___ \\ | | / _ \\ |_) |   / _ \\  | |    ${GRAY}ศูนย์รับฟังและร่วมพัฒนาทักษะ     ${NC}"
echo -e "${CYAN}   ___) || ||  __/  __/   / ___ \\ | |    ${GRAY}สำหรับพนักงานอุทยานฯ 22 ทีม     ${NC}"
echo -e "${CYAN}  |____/ |_| \\___|_|     /_/   \\_\\___|                           ${NC}"
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
