#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# After the user explicitly opens STeP AI once, make the remaining local helper scripts
# executable and remove the download quarantine flag from this verified release folder.
for f in "$SCRIPT_DIR"/*.command "$SCRIPT_DIR"/install/*.sh "$SCRIPT_DIR"/step-ai; do
    [ -e "$f" ] || continue
    chmod u+x "$f" 2>/dev/null || true
    xattr -d com.apple.quarantine "$f" 2>/dev/null || true
done

# A copy downloaded from GitHub carries Setup-STeP-Skills.command; the Pilot bundle does not. The folder workflow is
# retired for GitHub downloads, so hand over to the new setup there and keep this launcher for the Pilot bundle.
if [ -f "$SCRIPT_DIR/Setup-STeP-Skills.command" ]; then
    echo "วิธีติดตั้งแบบนี้เลิกใช้แล้ว กำลังเปิด Setup-STeP-Skills แทน"
    echo
    exec bash "$SCRIPT_DIR/Setup-STeP-Skills.command"
fi

bash "$SCRIPT_DIR/install/update-macos.sh"
