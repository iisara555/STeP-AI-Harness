"""
STeP AI — Setup Icons and Windows Shortcuts
Configures:
  1. Windows Folder Icon (desktop.ini with attributes)
  2. Windows Explorer Shortcuts (.lnk) with custom STeP AI Icon
  3. Optional Desktop Shortcut for easy employee access
"""
import subprocess
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
ICO_PATH = ASSETS / "step-ai.ico"

PS_SHORTCUT_SCRIPT = """
param(
    [string]$RepoDir,
    [string]$IcoPath,
    [switch]$CreateDesktopShortcut
)

$WshShell = New-Object -ComObject WScript.Shell

# 1. Folder shortcuts
$shortcuts = @(
    @{
        Name = "STeP AI - Feedback & Tasks.lnk";
        Target = "$RepoDir\\Feedback-STeP-AI.bat";
        Desc = "STeP AI - ศูนย์รับฟังข้อเสนอแนะและของานเพิ่มสำหรับพนักงาน"
    },
    @{
        Name = "STeP AI - Setup.lnk";
        Target = "$RepoDir\\Install-STeP-AI.bat";
        Desc = "STeP AI - ติดตั้งและเชื่อมต่อ AI Agents 22 ทีม"
    },
    @{
        Name = "STeP AI - Update.lnk";
        Target = "$RepoDir\\Update-STeP-AI.bat";
        Desc = "STeP AI - อัปเดตทักษะและมาตรฐานล่าสุด"
    }
)

foreach ($sc in $shortcuts) {
    $lnkPath = Join-Path $RepoDir $sc.Name
    $s = $WshShell.CreateShortcut($lnkPath)
    $s.TargetPath = $sc.Target
    $s.WorkingDirectory = $RepoDir
    $s.IconLocation = "$IcoPath,0"
    $s.Description = $sc.Desc
    $s.Save()
    Write-Host "[OK] Created shortcut: $($sc.Name)"
}

# 2. Configure folder icon via desktop.ini
$iniPath = Join-Path $RepoDir "desktop.ini"
$iniContent = "[.ShellClassInfo]`r`nIconResource=assets\\step-ai.ico,0`r`n[ViewState]`r`nMode=`r`nVid=`r`nFolderType=Generic`r`n"

# Remove read-only/hidden/system before writing if exists
if (Test-Path $iniPath) {
    attrib -h -s $iniPath
}
[System.IO.File]::WriteAllText($iniPath, $iniContent, [System.Text.Encoding]::Default)
attrib +h +s $iniPath
attrib +r $RepoDir
Write-Host "[OK] Configured folder icon in desktop.ini"

# 3. Optional Desktop Shortcut
if ($CreateDesktopShortcut) {
    $desktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
    if ($desktopPath -and (Test-Path $desktopPath)) {
        $desktopLnk = Join-Path $desktopPath "STeP AI Harness.lnk"
        $ds = $WshShell.CreateShortcut($desktopLnk)
        $ds.TargetPath = "$RepoDir\\Feedback-STeP-AI.bat"
        $ds.WorkingDirectory = $RepoDir
        $ds.IconLocation = "$IcoPath,0"
        $ds.Description = "อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP AI)"
        $ds.Save()
        Write-Host "[OK] Created Desktop shortcut: STeP AI Harness.lnk"
    }
}
"""

def setup_icons(create_desktop=False):
    if not ICO_PATH.exists():
        print(f"Error: Icon not found at {ICO_PATH}")
        return False

    ps_tmp = ROOT / "tmp_setup_icons.ps1"
    with open(ps_tmp, "w", encoding="utf-8-sig") as f:
        f.write(PS_SHORTCUT_SCRIPT)

    args = [
        "powershell.exe",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(ps_tmp),
        "-RepoDir",
        str(ROOT),
        "-IcoPath",
        str(ICO_PATH),
    ]
    if create_desktop:
        args.append("-CreateDesktopShortcut")

    res = subprocess.run(args, capture_output=True, check=False)
    if ps_tmp.exists():
        ps_tmp.unlink()

    stdout = res.stdout.decode("utf-8", errors="replace").strip()
    stderr = res.stderr.decode("utf-8", errors="replace").strip()

    if stdout:
        print(stdout)
    if stderr:
        print("Warnings/Errors:", stderr)

    return res.returncode == 0

if __name__ == "__main__":
    desktop_flag = "--desktop" in sys.argv
    setup_icons(create_desktop=desktop_flag)
