#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
. "$SCRIPT_DIR/macos-runtime.sh"
# Find only: no runtime download and no document upload during preflight.
if ! find_step_node "$ROOT_DIR"; then
    echo "เปิด Install-STeP-AI.command ให้เสร็จก่อน แล้วกลับมาตรวจไฟล์ก่อนแนบ AI"
    exit 2
fi
FILE_PATH="${1:-}"
if [ -z "$FILE_PATH" ]; then
    FILE_PATH="$(osascript -e 'POSIX path of (choose file with prompt "เลือกไฟล์เพื่อตรวจบนเครื่อง ก่อนแนบให้ AI")')" || exit 2
fi
"$STEP_NODE_BIN" "$ROOT_DIR/bin/step-ai.js" privacy --file "$FILE_PATH"
exit $?
