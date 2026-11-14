@echo off
chcp 65001 > nul
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0..\install\privacy-windows.ps1"
pause
