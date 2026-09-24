#!/bin/sh
set -eu
cd "$(dirname "$0")"

if [ ! -x ".venv/bin/python" ]; then
  echo "Run ./Install-OCR.command first."
  exit 1
fi

.venv/bin/python -m pip install -r requirements-handwriting.txt
echo "Thai-TrOCR optional fallback installed."
