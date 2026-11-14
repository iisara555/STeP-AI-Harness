#!/bin/bash

# This launcher lives in Tools/; the release folder is one level up.
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# After the user explicitly opens STeP AI once, make the remaining local helper scripts
# executable and remove the download quarantine flag from this verified release folder.
for f in "$ROOT_DIR"/*.command "$ROOT_DIR"/Tools/*.command "$ROOT_DIR"/install/*.sh "$ROOT_DIR"/step-ai; do
    [ -e "$f" ] || continue
    chmod u+x "$f" 2>/dev/null || true
    xattr -d com.apple.quarantine "$f" 2>/dev/null || true
done

# A copy downloaded from GitHub carries Setup-STeP-Skills.command; the Pilot bundle does not. The folder workflow is
# retired for GitHub downloads, so hand over to the new setup there and keep this launcher for the Pilot bundle.
if [ -f "$ROOT_DIR/Setup-STeP-Skills.command" ]; then
    echo "กำลังติดตั้ง STeP Skills สำหรับ Claude, Codex และ Google Antigravity..."
    echo
    exec bash "$ROOT_DIR/Setup-STeP-Skills.command"
fi

bash "$ROOT_DIR/install/update-macos.sh"
