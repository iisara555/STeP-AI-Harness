#!/bin/bash
# Installs the STeP Skills into Claude, Codex and Google Antigravity, then asks for the profile.
# Needs Node.js 18 or later; everything else is done by scripts/install-agent-skills.mjs setup.
cd "$(dirname "$0")" || exit 1
export PATH="$PATH:/usr/local/bin:/opt/homebrew/bin"

echo "================================================================"
echo "  STeP Skills for Claude / Codex / Google Antigravity"
echo "  STeP - Science and Technology Park, Chiang Mai University"
echo "================================================================"
echo

if ! command -v node >/dev/null 2>&1; then
    echo "[!] ยังไม่มี Node.js ในเครื่องนี้"
    echo "    กำลังเปิดหน้าดาวน์โหลด ติดตั้งแบบ LTS แล้วดับเบิลคลิกไฟล์นี้อีกครั้ง"
    open "https://nodejs.org/"
    echo
    read -r -p "กด Enter เพื่อปิด" _
    exit 1
fi

node scripts/install-agent-skills.mjs setup
echo
read -r -p "กด Enter เพื่อปิด" _
