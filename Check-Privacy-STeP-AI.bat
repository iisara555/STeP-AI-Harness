@echo off
chcp 65001 > nul
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0install\privacy-windows.ps1"
pause
