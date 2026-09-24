#!/bin/sh
set -eu
cd "$(dirname "$0")"

if [ ! -x ".venv/bin/python" ]; then
  echo "Run ./Install-OCR.command first."
  exit 1
fi

.venv/bin/python -m pip install -r requirements-crosscheck.txt
PYTHONIOENCODING=utf-8 .venv/bin/python -c "import easyocr; easyocr.Reader(['th','en'], gpu=False, detector=False, verbose=False)"
echo "EasyOCR Thai and English cross-check installed."
