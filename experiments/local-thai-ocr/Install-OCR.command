#!/bin/sh
set -eu
cd "$(dirname "$0")"

PYTHON=""
for candidate in python3.12 python3.11 python3.10 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    if "$candidate" -c 'import sys; raise SystemExit(0 if (3,10) <= sys.version_info[:2] <= (3,12) else 1)' >/dev/null 2>&1; then
      PYTHON="$candidate"
      break
    fi
  fi
done

if [ -z "$PYTHON" ]; then
  echo "Python 3.10-3.12 is required for this standalone experiment."
  exit 1
fi

if [ ! -x ".venv/bin/python" ]; then
  "$PYTHON" -m venv .venv
fi

.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install paddlepaddle==3.3.0 -i https://www.paddlepaddle.org.cn/packages/stable/cpu/
.venv/bin/python -m pip install -r requirements-core.txt

echo
echo "Core OCR installed. EasyOCR cross-check and Thai-TrOCR handwriting are optional."
echo "Run ./Start-OCR.command"
