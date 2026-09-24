@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Run Install-OCR.bat first.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -m pip install -r requirements-crosscheck.txt
if errorlevel 1 (
  echo EasyOCR optional install failed.
  pause
  exit /b 1
)
set PYTHONIOENCODING=utf-8
".venv\Scripts\python.exe" -c "import easyocr; easyocr.Reader(['th','en'], gpu=False, detector=False, verbose=False)"
if errorlevel 1 (
  echo EasyOCR model download failed. Retry this installer when online.
  pause
  exit /b 1
)
echo EasyOCR Thai and English cross-check installed.
pause
