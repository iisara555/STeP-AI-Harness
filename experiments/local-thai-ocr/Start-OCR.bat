@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo OCR is not installed yet. Run Install-OCR.bat first.
  pause
  exit /b 1
)
echo Keep this window open while using OCR. Closing it stops the local server.
echo.
".venv\Scripts\python.exe" app.py
if errorlevel 1 (
  echo.
  echo OCR server stopped unexpectedly. Check the error above.
  pause
  exit /b 1
)
