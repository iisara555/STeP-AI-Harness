#!/usr/bin/env bash
# STeP AI — Zero-Terminal macOS Updater
# อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO="iisara555/STeP-AI-Harness"
LATEST_API="https://api.github.com/repos/$REPO/releases/latest"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
GRAY='\033[0;90m'
NC='\033[0m'

if ! command -v node >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  ไม่พบ Node.js ในเครื่อง กรุณาติดต่อ AI Champion${NC}"
    read -r -p "กด Enter เพื่อออก..." _
    exit 1
fi

CURRENT_VERSION="$(node -e "const fs=require('fs'); console.log(JSON.parse(fs.readFileSync(process.argv[1],'utf8')).version)" "$ROOT_DIR/package.json")"

show_header() {
    clear || true
    echo -e "${CYAN}=================================================================${NC}"
    echo -e "${CYAN}   STeP AI Update & Sync${NC}"
    echo -e "${YELLOW}   Current version: v$CURRENT_VERSION${NC}"
    echo -e "${GRAY}   22 Teams • 43 Skills • Safe Workspace Upgrade${NC}"
    echo -e "${CYAN}=================================================================${NC}"
    echo ""
}

local_sync() {
    echo -e "${YELLOW}กำลังซิงก์ Skills, Rules และ Router จากเวอร์ชันที่ติดตั้งอยู่...${NC}"
    node "$ROOT_DIR/bin/step-ai.js" update --dest "$ROOT_DIR"
}

finish_update() {
    echo ""
    echo -e "${GREEN}=================================================================${NC}"
    echo -e "${YELLOW}                 ✓ การอัปเดตเสร็จสมบูรณ์${NC}"
    echo -e "${GREEN}=================================================================${NC}"
    echo ""
    read -r -p "กด Enter เพื่อเสร็จสิ้น..." _
}

show_header
echo -e "${GRAY}กำลังตรวจสอบรุ่นล่าสุดจาก GitHub Releases...${NC}"

TMP_API="$(mktemp)"
if ! curl -fsSL --connect-timeout 10 --max-time 20     -H "Accept: application/vnd.github+json"     -H "User-Agent: STeP-AI-Updater"     "$LATEST_API" -o "$TMP_API"; then
    rm -f "$TMP_API"
    echo -e "${YELLOW}ไม่สามารถตรวจสอบ GitHub Releases ได้ ระบบจะซิงก์ Workspace จากเวอร์ชันที่ติดตั้งอยู่แทน${NC}"
    local_sync
    finish_update
    exit 0
fi

LATEST_VERSION="$(node -e "const fs=require('fs'); const r=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); console.log(String(r.tag_name||'').replace(/^v/i,''))" "$TMP_API")"
rm -f "$TMP_API"

if [ -z "$LATEST_VERSION" ]; then
    echo -e "${RED}ไม่พบ version จาก GitHub Release${NC}"
    local_sync
    finish_update
    exit 0
fi

COMPARE="$(node -e "
const p=v=>v.replace(/^v/i,'').split('.').slice(0,3).map(Number);
const a=p(process.argv[1]),b=p(process.argv[2]);
let r=0; for(let i=0;i<3;i++){if(a[i]>b[i]){r=1;break} if(a[i]<b[i]){r=-1;break}}
console.log(r);
" "$LATEST_VERSION" "$CURRENT_VERSION")"

echo "เวอร์ชันปัจจุบัน: v$CURRENT_VERSION"
echo "เวอร์ชันล่าสุด:  v$LATEST_VERSION"

if [ "$COMPARE" -le 0 ]; then
    echo -e "${GREEN}✓ ใช้เวอร์ชันล่าสุดอยู่แล้ว${NC}"
    local_sync
    finish_update
    exit 0
fi

ASSET="STeP-AI-Pilot-v$LATEST_VERSION.zip"
BASE_URL="https://github.com/$REPO/releases/download/v$LATEST_VERSION"
ZIP_URL="$BASE_URL/$ASSET"
CHECKSUM_URL="$BASE_URL/$ASSET.sha256"
TEMP_ROOT="$(mktemp -d -t step-ai-update.XXXXXX)"
ZIP_PATH="$TEMP_ROOT/$ASSET"
EXTRACT_DIR="$TEMP_ROOT/release"

cleanup() {
    rm -rf "$TEMP_ROOT"
}
trap cleanup EXIT

mkdir -p "$EXTRACT_DIR"

echo ""
echo -e "${YELLOW}พบเวอร์ชันใหม่ v$LATEST_VERSION กำลังดาวน์โหลด...${NC}"
curl -fL --connect-timeout 10 --max-time 120     -H "User-Agent: STeP-AI-Updater"     "$ZIP_URL" -o "$ZIP_PATH"

CHECKSUM_PATH="$TEMP_ROOT/$ASSET.sha256"
if curl -fsSL --connect-timeout 10 --max-time 30     -H "User-Agent: STeP-AI-Updater"     "$CHECKSUM_URL" -o "$CHECKSUM_PATH"; then
    EXPECTED_HASH="$(awk '{print toupper($1)}' "$CHECKSUM_PATH" | head -n 1)"
    ACTUAL_HASH="$(shasum -a 256 "$ZIP_PATH" | awk '{print toupper($1)}')"
    if [ "$EXPECTED_HASH" != "$ACTUAL_HASH" ]; then
        echo -e "${RED}SHA-256 checksum mismatch. ยกเลิกการอัปเดตเพื่อความปลอดภัย${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ ตรวจสอบ SHA-256 ผ่าน${NC}"
else
    echo -e "${YELLOW}⚠️  Release นี้ไม่มี checksum file ระบบจะตรวจโครงสร้าง package ก่อนติดตั้ง${NC}"
fi

ditto -x -k "$ZIP_PATH" "$EXTRACT_DIR"

NEW_ROOT="$EXTRACT_DIR"
if [ ! -f "$NEW_ROOT/package.json" ]; then
    CANDIDATE="$(find "$EXTRACT_DIR" -mindepth 1 -maxdepth 1 -type d -exec test -f '{}/package.json' ';' -print | head -n 1)"
    if [ -n "$CANDIDATE" ]; then NEW_ROOT="$CANDIDATE"; fi
fi

if [ ! -f "$NEW_ROOT/package.json" ] || [ ! -f "$NEW_ROOT/bin/step-ai.js" ]; then
    echo -e "${RED}Downloaded Release package is incomplete.${NC}"
    exit 1
fi

NEW_VERSION="$(node -e "const fs=require('fs'); console.log(JSON.parse(fs.readFileSync(process.argv[1],'utf8')).version)" "$NEW_ROOT/package.json")"
if [ "$NEW_VERSION" != "$LATEST_VERSION" ]; then
    echo -e "${RED}Release version mismatch: expected $LATEST_VERSION, found $NEW_VERSION${NC}"
    exit 1
fi

echo -e "${YELLOW}กำลังสำรองข้อมูลและอัปเกรด Workspace...${NC}"
node "$NEW_ROOT/bin/step-ai.js" upgrade-apply --dest "$ROOT_DIR" --version "$LATEST_VERSION"

CURRENT_VERSION="$LATEST_VERSION"
echo -e "${GREEN}✓ อัปเดตเป็น v$LATEST_VERSION เรียบร้อย${NC}"
finish_update
