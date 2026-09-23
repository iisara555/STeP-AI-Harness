@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Run Install-OCR.bat first.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -m pip install -r requirements-handwriting.txt
if errorlevel 1 (
  echo Thai-TrOCR optional install failed.
  pause
  exit /b 1
)
echo Thai-TrOCR optional fallback installed.
pause
