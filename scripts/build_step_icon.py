"""
Build STeP AI Icon Assets
Converts the generated STeP AI logo image into:
  - assets/step-ai.png (High-Res 1024x1024 PNG)
  - assets/step-ai.ico (Multi-resolution Windows Icon: 256, 128, 64, 48, 32, 16)
"""
import struct
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
ASSETS.mkdir(exist_ok=True)

SOURCE_IMG = Path(r"C:\Users\USER\.gemini\antigravity-ide\brain\a9f72998-c318-4692-8153-b806ed41a8f8\step_official_logo_1789541359863.jpg")
PNG_OUT = ASSETS / "step-ai.png"
ICO_OUT = ASSETS / "step-ai.ico"

# PowerShell script to resize and export PNGs at various resolutions
# then we pack them into an ICO container.
PS_SCRIPT = f"""
Add-Type -AssemblyName System.Drawing

$src = '{SOURCE_IMG}'
$img = [System.Drawing.Image]::FromFile($src)

# Save main PNG
$img.Save('{PNG_OUT}', [System.Drawing.Imaging.ImageFormat]::Png)

$sizes = @(256, 128, 64, 48, 32, 16)
foreach ($s in $sizes) {{
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($img, 0, 0, $s, $s)
    $g.Dispose()
    
    $outPath = Join-Path '{ASSETS}' "temp_$s.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}}

$img.Dispose()
Write-Host "PNG exports completed."
"""

def create_ico_from_pngs(sizes, output_ico):
    images_data = []
    for s in sizes:
        png_path = ASSETS / f"temp_{s}.png"
        with open(png_path, "rb") as f:
            data = f.read()
        images_data.append((s, data))

    # ICONDIR header: 6 bytes
    # idReserved (2 bytes, 0), idType (2 bytes, 1), idCount (2 bytes, len(images))
    header = struct.pack("<HHH", 0, 1, len(images_data))

    # Calculate offset where image data begins
    offset = 6 + 16 * len(images_data)

    entries = []
    for s, data in images_data:
        w = 0 if s == 256 else s
        h = 0 if s == 256 else s
        # bWidth(1), bHeight(1), bColorCount(1), bReserved(1), wPlanes(2), wBitCount(2), dwBytesInRes(4), dwImageOffset(4)
        entry = struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(data), offset)
        entries.append(entry)
        offset += len(data)

    with open(output_ico, "wb") as f:
        f.write(header)
        for e in entries:
            f.write(e)
        for _, data in images_data:
            f.write(data)

    # Clean up temp pngs
    for s in sizes:
        png_path = ASSETS / f"temp_{s}.png"
        if png_path.exists():
            png_path.unlink()

def main():
    if not SOURCE_IMG.exists():
        print(f"Error: Source image not found at {SOURCE_IMG}")
        return

    # Run powershell script
    ps_file = ROOT / "tmp_icon_export.ps1"
    with open(ps_file, "w", encoding="utf-8") as f:
        f.write(PS_SCRIPT)

    res = subprocess.run(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ps_file)], capture_output=True, text=True)
    if ps_file.exists():
        ps_file.unlink()

    if res.returncode != 0:
        print("PowerShell error:", res.stderr)
        return

    print(res.stdout.strip())
    sizes = [256, 128, 64, 48, 32, 16]
    create_ico_from_pngs(sizes, ICO_OUT)
    print(f"[OK] Created {PNG_OUT} ({PNG_OUT.stat().st_size} bytes)")
    print(f"[OK] Created {ICO_OUT} ({ICO_OUT.stat().st_size} bytes, multi-res: {sizes})")

if __name__ == "__main__":
    main()
