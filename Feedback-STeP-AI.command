#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# After the user explicitly opens STeP AI once, make the remaining local helper scripts
# executable and remove the download quarantine flag from this verified release folder.
for f in "$SCRIPT_DIR"/*.command "$SCRIPT_DIR"/install/*.sh; do
    [ -e "$f" ] || continue
    chmod u+x "$f" 2>/dev/null || true
    xattr -d com.apple.quarantine "$f" 2>/dev/null || true
done

bash "$SCRIPT_DIR/install/feedback-macos.sh"
