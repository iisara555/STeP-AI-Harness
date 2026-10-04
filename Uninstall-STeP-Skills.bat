@echo off
chcp 65001 > nul
title STeP Skills Uninstall
rem Removes what Setup-STeP-Skills installed in Claude, Codex and Google Antigravity; work files are kept.
rem Needs Node.js 18 or later; everything else is done by scripts\install-agent-skills.mjs uninstall.

echo ================================================================
echo   Uninstall STeP Skills from Claude / Codex / Google Antigravity
echo   STeP - Science and Technology Park, Chiang Mai University
echo ================================================================
echo.

where node > nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [!] ยังไม่มี Node.js ในเครื่องนี้
    echo     กำลังเปิดหน้าดาวน์โหลด ติดตั้งแบบ LTS กด Next จนจบ
    echo     แล้วดับเบิลคลิกไฟล์นี้อีกครั้ง
    start "" https://nodejs.org/
    echo.
    pause
    exit /b 1
)

node "%~dp0scripts\install-agent-skills.mjs" uninstall
echo.
pause
