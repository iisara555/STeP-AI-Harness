@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo OCR is not installed yet. Run Install-OCR.bat first.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" app.py
