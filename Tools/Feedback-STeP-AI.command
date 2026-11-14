#!/bin/bash

# This launcher lives in Tools/; the release folder is one level up.
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# After the user explicitly opens STeP AI once, make the remaining local helper scripts
# executable and remove the download quarantine flag from this verified release folder.
for f in "$ROOT_DIR"/*.command "$ROOT_DIR"/Tools/*.command "$ROOT_DIR"/install/*.sh; do
    [ -e "$f" ] || continue
    chmod u+x "$f" 2>/dev/null || true
    xattr -d com.apple.quarantine "$f" 2>/dev/null || true
done

bash "$ROOT_DIR/install/feedback-macos.sh"
