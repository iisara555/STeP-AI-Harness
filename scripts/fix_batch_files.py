"""
STeP AI — Fix and Generate Windows Batch Launchers
Ensures all .bat files have CRLF line endings, proper escape characters,
and UTF-8 text under code page 65001 (the banners are Thai). CRLF is what prevents
cmd.exe parser desynchronization.
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
    "echo   \\___ \\ ^| ^| / _ \\ ^|_) ^|   / _ \\  ^| ^|    ผู้ช่วย AI ขององค์กร\r\n"
    "echo    ___) ^|^| ^|^|  __/  __/   / ___ \\ ^| ^|    22 ทีม · 5 กลุ่มงาน\r\n"
    "echo   ^|____/ ^|_^| \\___^|_^|     /_/   \\_\\___^|\r\n"
    "echo ================================================================\r\n"
    "echo   อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่\r\n"
    "echo ================================================================\r\n"
    "echo.\r\n"
    "echo กำลังเปิดตัวช่วยติดตั้ง STeP AI...\r\n"
    "echo.\r\n"
    "\r\n"
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\\install-windows.ps1"\r\n'
    "\r\n"
    "if %ERRORLEVEL% NEQ 0 (\r\n"
    "    echo.\r\n"
    "    echo [!] ติดตั้งไม่สำเร็จ ดูข้อความด้านบน แล้วแจ้งทีมดูแลตาม SUPPORT.md\r\n"
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
    "echo   \\___ \\ ^| ^| / _ \\ ^|_) ^|   / _ \\  ^| ^|    ผู้ช่วย AI ขององค์กร\r\n"
    "echo    ___) ^|^| ^|^|  __/  __/   / ___ \\ ^| ^|    22 ทีม · 5 กลุ่มงาน\r\n"
    "echo   ^|____/ ^|_^| \\___^|_^|     /_/   \\_\\___^|\r\n"
    "echo ================================================================\r\n"
    "echo   อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่\r\n"
    "echo ================================================================\r\n"
    "echo.\r\n"
    "echo กำลังเปิดตัวช่วยอัปเดต STeP AI...\r\n"
    "echo.\r\n"
    "\r\n"
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\\update-windows.ps1"\r\n'
    "\r\n"
    "if %ERRORLEVEL% NEQ 0 (\r\n"
    "    echo.\r\n"
    "    echo [!] อัปเดตไม่สำเร็จ ดูข้อความด้านบน แล้วแจ้งทีมดูแลตาม SUPPORT.md\r\n"
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
    "echo   \\___ \\ ^| ^| / _ \\ ^|_) ^|   / _ \\  ^| ^|    ผู้ช่วย AI ขององค์กร\r\n"
    "echo    ___) ^|^| ^|^|  __/  __/   / ___ \\ ^| ^|    22 ทีม · 5 กลุ่มงาน\r\n"
    "echo   ^|____/ ^|_^| \\___^|_^|     /_/   \\_\\___^|\r\n"
    "echo ================================================================\r\n"
    "echo   อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่\r\n"
    "echo ================================================================\r\n"
    "echo.\r\n"
    "echo กำลังเปิดตัวช่วยแจ้งปัญหา STeP AI...\r\n"
    "echo.\r\n"
    "\r\n"
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\\feedback-windows.ps1"\r\n'
    "\r\n"
    "if %ERRORLEVEL% NEQ 0 (\r\n"
    "    echo.\r\n"
    "    echo [!] เปิดตัวช่วยแจ้งปัญหาไม่สำเร็จ ดูข้อความด้านบน\r\n"
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
            f.write(content.encode("utf-8"))
        print(f"Updated {path.name} with CRLF (UTF-8, code page 65001) ({len(content)} bytes)")

if __name__ == "__main__":
    main()
