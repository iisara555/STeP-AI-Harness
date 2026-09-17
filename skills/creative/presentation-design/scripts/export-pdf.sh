#!/usr/bin/env bash
# STeP Presentation Design — Export PDF Helper for macOS/Linux
set -euo pipefail

if [ $# -lt 1 ]; then
    echo "❌ วิธีใช้: bash scripts/export-pdf.sh <presentation.html> [output.pdf]"
    exit 1
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$DIR/export-pdf.js" "$1" "${2:-}"
