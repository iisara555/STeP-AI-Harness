@echo off
chcp 65001 > nul
title STeP AI Update & Sync (Pilot v0.2)

echo ================================================================
echo    ____ _____     ____       _    ___ 
echo   / ___^|_   _^|___^|  _ \     / \  ^|_ _^|   STeP AI Update & Sync
echo   \___ \ ^| ^| / _ \ ^|_) ^|   / _ \  ^| ^|    Enterprise AI Architecture
echo    ___) ^|^| ^|^|  __/  __/   / ___ \ ^| ^|    22 Teams - 5 Clusters
echo   ^|____/ ^|_^| \___^|_^|     /_/   \_\___^|
echo ================================================================
echo   อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP / RSP North)
echo ================================================================
echo.
echo กำลังเริ่มต้นระบบอัปเดตสำหรับพนักงาน...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\update-windows.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] ไม่สามารถดำเนินการอัปเดตได้
    pause
)
