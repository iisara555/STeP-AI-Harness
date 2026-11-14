#!/usr/bin/env bash
# This launcher lives in Tools/; the release folder is one level up.
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT_DIR/install/privacy-macos.sh"
status=$?
read -r -p "กด Enter เพื่อปิด..." reply
exit "$status"
