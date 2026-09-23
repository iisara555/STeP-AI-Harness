@echo off
setlocal
cd /d "%~dp0"

set "PYTHON="
where py >nul 2>nul && set "PYTHON=py -3"
if not defined PYTHON (
  where python >nul 2>nul && set "PYTHON=python"
)
if not defined PYTHON (
  echo Python 3.10-3.12 64-bit is required for this standalone experiment.
  echo Install Python, then run this file again.
  pause
  exit /b 1
)

%PYTHON% -c "import sys; raise SystemExit(0 if (3,10) <= sys.version_info[:2] <= (3,12) else 1)"
if errorlevel 1 (
  echo Please use Python 3.10, 3.11, or 3.12 for the pilot.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  %PYTHON% -m venv .venv
  if errorlevel 1 goto :fail
)

".venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto :fail

echo Installing PaddlePaddle CPU runtime...
".venv\Scripts\python.exe" -m pip install paddlepaddle==3.3.0 -i https://www.paddlepaddle.org.cn/packages/stable/cpu/
if errorlevel 1 goto :fail

echo Installing local OCR dependencies...
".venv\Scripts\python.exe" -m pip install -r requirements-core.txt
if errorlevel 1 goto :fail

echo.
echo Core OCR installed. Thai-TrOCR handwriting fallback is optional and is NOT installed by default.
echo Run Start-OCR.bat to open the local trial page.
pause
exit /b 0

:fail
echo.
echo Installation failed. No Harness files outside this experiment were changed.
pause
exit /b 1
