@echo off
chcp 65001 > nul
title STeP AI Feedback & Skills (Pilot v0.2)

echo ================================================================
echo    ____ _____     ____       _    ___ 
echo   / ___^|_   _^|___^|  _ \     / \  ^|_ _^|   STeP AI Feedback & Skills
echo   \___ \ ^| ^| / _ \ ^|_) ^|   / _ \  ^| ^|    ศูนย์รับฟังความคิดเห็นและเสนอทักษะ
echo    ___) ^|^| ^|^|  __/  __/   / ___ \ ^| ^|    สำหรับพนักงานอุทยานฯ 22 ทีม
echo   ^|____/ ^|_^| \___^|_^|     /_/   \_\___^|
echo ================================================================
echo   อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP / RSP North)
echo ================================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\feedback-windows.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] เกิดข้อผิดพลาดในการเปิดระบบ
    pause
)
