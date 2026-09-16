@echo off
chcp 65001 > nul
title STeP AI Update & Sync (Pilot v0.2)

echo ============================================================
echo         STeP AI Update — อุทยานวิทยาศาสตร์และเทคโนโลยี มช.
echo ============================================================
echo กำลังเริ่มต้นระบบอัปเดตสำหรับพนักงาน...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\update-windows.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] ไม่สามารถดำเนินการอัปเดตได้
    pause
)
