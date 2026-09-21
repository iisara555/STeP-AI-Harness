#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/install/privacy-macos.sh"
status=$?
read -r -p "กด Enter เพื่อปิด..." reply
exit "$status"
