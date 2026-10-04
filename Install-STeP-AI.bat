@echo off
chcp 65001 > nul
title STeP AI Setup

rem A copy downloaded from GitHub carries Setup-STeP-Skills.bat; the Pilot bundle does not. The folder workflow is
rem retired for GitHub downloads, so hand over to the new setup there and keep this launcher for the Pilot bundle.
if exist "%~dp0Setup-STeP-Skills.bat" (
    echo วิธีติดตั้งแบบนี้เลิกใช้แล้ว กำลังเปิด Setup-STeP-Skills แทน
    echo.
    call "%~dp0Setup-STeP-Skills.bat"
    exit /b
)


echo ================================================================
echo    ____ _____     ____       _    ___ 
echo   / ___^|_   _^|___^|  _ \     / \  ^|_ _^|   STeP AI Setup
echo   \___ \ ^| ^| / _ \ ^|_) ^|   / _ \  ^| ^|    Enterprise AI Architecture
echo    ___) ^|^| ^|^|  __/  __/   / ___ \ ^| ^|    22 Teams - 5 Clusters
echo   ^|____/ ^|_^| \___^|_^|     /_/   \_\___^|
echo ================================================================
echo   STeP - Science and Technology Park, Chiang Mai University
echo ================================================================
echo.
echo Starting STeP AI setup wizard...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\install-windows.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Installation failed.
    pause
)
