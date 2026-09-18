@echo off
chcp 65001 > nul
title STeP AI Update

echo ================================================================
echo    ____ _____     ____       _    ___ 
echo   / ___^|_   _^|___^|  _ \     / \  ^|_ _^|   STeP AI Update and Sync
echo   \___ \ ^| ^| / _ \ ^|_) ^|   / _ \  ^| ^|    Enterprise AI Architecture
echo    ___) ^|^| ^|^|  __/  __/   / ___ \ ^| ^|    22 Teams - 5 Clusters
echo   ^|____/ ^|_^| \___^|_^|     /_/   \_\___^|
echo ================================================================
echo   STeP - Science and Technology Park, Chiang Mai University
echo ================================================================
echo.
echo Starting STeP AI update wizard...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\update-windows.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Update failed.
    pause
)
