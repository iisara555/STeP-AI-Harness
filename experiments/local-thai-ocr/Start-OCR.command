#!/bin/sh
set -eu
cd "$(dirname "$0")"

if [ ! -x ".venv/bin/python" ]; then
  echo "OCR is not installed yet. Run ./Install-OCR.command first."
  exit 1
fi

exec .venv/bin/python app.py
