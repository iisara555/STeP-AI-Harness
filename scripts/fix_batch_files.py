"""
STeP AI — Fix and Generate Windows Batch Launchers
Ensures all .bat files have CRLF line endings, proper escape characters,
and safe ASCII headers to prevent cmd.exe parser desynchronization bugs.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

INSTALL_BAT = (
    "@echo off\r\n"
    "chcp 65001 > nul\r\n"
    "title STeP AI Setup (Pilot v0.2)\r\n"
    "\r\n"
    "echo ================================================================\r\n"
    "echo    ____ _____     ____       _    ___ \r\n"
    "echo   / ___^|_   _^|___^|  _ \\     / \\  ^|_ _^|   STeP AI Setup (Pilot v0.2)\r\n"
    "echo   \\___ \\ ^| ^| / _ \\ ^|_) ^|   / _ \\  ^| ^|    Enterprise AI Architecture\r\n"
    "echo    ___) ^|^| ^|^|  __/  __/   / ___ \\ ^| ^|    22 Teams - 5 Clusters\r\n"
    "echo   ^|____/ ^|_^| \\___^|_^|     /_/   \\_\\___^|\r\n"
    "echo ================================================================\r\n"
    "echo   STeP - Science and Technology Park, Chiang Mai University\r\n"
    "echo ================================================================\r\n"
    "echo.\r\n"
    "echo Starting STeP AI setup wizard...\r\n"
    "echo.\r\n"
    "\r\n"
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\\install-windows.ps1"\r\n'
    "\r\n"
    "if %ERRORLEVEL% NEQ 0 (\r\n"
    "    echo.\r\n"
    "    echo [ERROR] Installation failed.\r\n"
    "    pause\r\n"
    ")\r\n"
)

UPDATE_BAT = (
    "@echo off\r\n"
    "chcp 65001 > nul\r\n"
    "title STeP AI Update (Pilot v0.2)\r\n"
    "\r\n"
    "echo ================================================================\r\n"
    "echo    ____ _____     ____       _    ___ \r\n"
    "echo   / ___^|_   _^|___^|  _ \\     / \\  ^|_ _^|   STeP AI Update and Sync\r\n"
    "echo   \\___ \\ ^| ^| / _ \\ ^|_) ^|   / _ \\  ^| ^|    Enterprise AI Architecture\r\n"
    "echo    ___) ^|^| ^|^|  __/  __/   / ___ \\ ^| ^|    22 Teams - 5 Clusters\r\n"
    "echo   ^|____/ ^|_^| \\___^|_^|     /_/   \\_\\___^|\r\n"
    "echo ================================================================\r\n"
    "echo   STeP - Science and Technology Park, Chiang Mai University\r\n"
    "echo ================================================================\r\n"
    "echo.\r\n"
    "echo Starting STeP AI update wizard...\r\n"
    "echo.\r\n"
    "\r\n"
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\\update-windows.ps1"\r\n'
    "\r\n"
    "if %ERRORLEVEL% NEQ 0 (\r\n"
    "    echo.\r\n"
    "    echo [ERROR] Update failed.\r\n"
    "    pause\r\n"
    ")\r\n"
)

FEEDBACK_BAT = (
    "@echo off\r\n"
    "chcp 65001 > nul\r\n"
    "title STeP AI Feedback (Pilot v0.2)\r\n"
    "\r\n"
    "echo ================================================================\r\n"
    "echo    ____ _____     ____       _    ___ \r\n"
    "echo   / ___^|_   _^|___^|  _ \\     / \\  ^|_ _^|   STeP AI Feedback and Tasks\r\n"
    "echo   \\___ \\ ^| ^| / _ \\ ^|_) ^|   / _ \\  ^| ^|    Enterprise AI Architecture\r\n"
    "echo    ___) ^|^| ^|^|  __/  __/   / ___ \\ ^| ^|    22 Teams - 5 Clusters\r\n"
    "echo   ^|____/ ^|_^| \\___^|_^|     /_/   \\_\\___^|\r\n"
    "echo ================================================================\r\n"
    "echo   STeP - Science and Technology Park, Chiang Mai University\r\n"
    "echo ================================================================\r\n"
    "echo.\r\n"
    "echo Starting STeP AI feedback helper...\r\n"
    "echo.\r\n"
    "\r\n"
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\\feedback-windows.ps1"\r\n'
    "\r\n"
    "if %ERRORLEVEL% NEQ 0 (\r\n"
    "    echo.\r\n"
    "    echo [ERROR] Failed to open feedback helper.\r\n"
    "    pause\r\n"
    ")\r\n"
)

def main():
    files = {
        ROOT / "Install-STeP-AI.bat": INSTALL_BAT,
        ROOT / "Update-STeP-AI.bat": UPDATE_BAT,
        ROOT / "Feedback-STeP-AI.bat": FEEDBACK_BAT,
    }

    for path, content in files.items():
        with open(path, "wb") as f:
            f.write(content.encode("ascii"))
        print(f"Updated {path.name} with CRLF and safe ASCII ({len(content)} bytes)")

if __name__ == "__main__":
    main()
