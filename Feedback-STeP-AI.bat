@echo off
chcp 65001 > nul
title STeP AI Feedback (Pilot v0.2)

echo ================================================================
echo    ____ _____     ____       _    ___ 
echo   / ___^|_   _^|___^|  _ \     / \  ^|_ _^|   STeP AI Feedback and Tasks
echo   \___ \ ^| ^| / _ \ ^|_) ^|   / _ \  ^| ^|    ผู้ช่วย AI ขององค์กร
echo    ___) ^|^| ^|^|  __/  __/   / ___ \ ^| ^|    22 ทีม · 5 กลุ่มงาน
echo   ^|____/ ^|_^| \___^|_^|     /_/   \_\___^|
echo ================================================================
echo   อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่
echo ================================================================
echo.
echo กำลังเปิดตัวช่วยแจ้งปัญหา STeP AI...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\feedback-windows.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] เปิดตัวช่วยแจ้งปัญหาไม่สำเร็จ ดูข้อความด้านบน
    pause
)
