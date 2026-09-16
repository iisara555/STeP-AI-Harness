#!/usr/bin/env bash
# STeP AI — Zero-Terminal macOS Updater (Pilot v0.1)
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
NC='\033[0m'

clear || true
echo -e "${CYAN}============================================================${NC}"
echo -e "${YELLOW}               STeP AI Update (Pilot v0.1)                  ${NC}"
echo -e "${WHITE}   อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP) ${NC}"
echo -e "${CYAN}============================================================${NC}"
echo ""

# 1. Check Node.js Runtime
if ! command -v node >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  ไม่พบ Node.js ในเครื่องคอมพิวเตอร์ของคุณ${NC}"
    echo -e "กรุณาดาวน์โหลดได้ที่: ${CYAN}https://nodejs.org${NC}"
    read -p "กด Enter เพื่อออกจากโปรแกรม..." dummy
    exit 1
fi

cd "$ROOT_DIR"

# 2. Run Update
echo -e "${YELLOW}กำลังดำเนินการอัปเดต Approved Skills และ Router ล่าสุด...${NC}"
node "$ROOT_DIR/bin/step-ai.js" update

# 3. Run Doctor
echo ""
node "$ROOT_DIR/bin/step-ai.js" doctor --employee

echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${YELLOW}                 ✓ อัปเดต STeP AI สำเร็จแล้ว                ${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo -e "  ระบบได้ทำการสำรองข้อมูล และอัปเดต Skills ให้ตรงกับส่วนกลางล่าสุดแล้ว"
echo -e "  ไฟล์ที่คุณเคยปรับแก้เองได้รับการปกป้องไว้อย่างปลอดภัย"
echo ""
read -p "กด Enter เพื่อเสร็จสิ้น..." dummy
