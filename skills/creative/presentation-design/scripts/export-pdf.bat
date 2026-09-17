@echo off
REM STeP Presentation Design — Export PDF Helper for Windows
setlocal enabledelayedexpansion

if "%~1"=="" (
    echo [ERROR] กรุณาระบุไฟล์ HTML ที่ต้องการแปลงเป็น PDF
    echo วิธีใช้: export-pdf.bat presentation.html [output.pdf]
    pause
    exit /b 1
)

echo [INFO] กำลังประมวลผลการส่งออก PDF ด้วย Playwright...
node "%~dp0export-pdf.js" "%~1" "%~2"

if %ERRORLEVEL% NEQ 0 (
    echo [WARN] หากยังไม่มี Playwright ในเครื่อง ให้รันคำสั่ง:
    echo        npx -y playwright install chromium
)

endlocal
