@echo off
chcp 65001 > nul
title STeP AI Setup (Pilot v0.2)

echo ============================================================
echo         STeP AI — อุทยานวิทยาศาสตร์และเทคโนโลยี มช.
echo ============================================================
echo กำลังเริ่มต้นระบบติดตั้งสำหรับพนักงาน...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\install-windows.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] ไม่สามารถดำเนินการติดตั้งได้
    pause
)
