@echo off
chcp 65001 > nul
title STeP AI Update

rem A copy downloaded from GitHub carries Setup-STeP-Skills.bat; the Pilot bundle does not. The folder workflow is
rem retired for GitHub downloads, so hand over to the new setup there and keep this launcher for the Pilot bundle.
if exist "%~dp0Setup-STeP-Skills.bat" (
    echo กำลังติดตั้ง STeP Skills สำหรับ Claude, Codex และ Google Antigravity...
    echo.
    call "%~dp0Setup-STeP-Skills.bat"
    exit /b
)


echo ================================================================
echo    ____ _____     ____       _    ___ 
echo   / ___^|_   _^|___^|  _ \     / \  ^|_ _^|   STeP AI Update and Sync
echo   \___ \ ^| ^| / _ \ ^|_) ^|   / _ \  ^| ^|    ผู้ช่วย AI ขององค์กร
echo    ___) ^|^| ^|^|  __/  __/   / ___ \ ^| ^|    22 ทีม · 5 กลุ่มงาน
echo   ^|____/ ^|_^| \___^|_^|     /_/   \_\___^|
echo ================================================================
echo   อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่
echo ================================================================
echo.
echo กำลังเปิดตัวช่วยอัปเดต STeP AI...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\update-windows.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] อัปเดตไม่สำเร็จ ดูข้อความด้านบน แล้วแจ้งทีมดูแลตาม SUPPORT.md
    pause
)
