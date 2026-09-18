#!/usr/bin/env python3
"""
build_pilot_bundle.py
---------------------
Packages the STeP AI Harness into a standalone, ready-to-distribute ZIP archive
for general STeP staff to download from GitHub Releases, Shared Drive, or organization shared folders.

Usage:
    python scripts/build_pilot_bundle.py
"""

import os
import json
import zipfile
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent

def build_pilot_bundle():
    pkg_path = ROOT / "package.json"
    with open(pkg_path, "r", encoding="utf-8") as f:
        pkg = json.load(f)

    version = pkg.get("version", "0.1.0")
    dist_dir = ROOT / "dist"
    dist_dir.mkdir(exist_ok=True)

    zip_name = f"STeP-AI-Pilot-v{version}.zip"
    zip_path = dist_dir / zip_name

    print("============================================================")
    print(f" Building STeP AI Pilot Distribution Bundle: v{version}")
    print(f" Target: {zip_path}")
    print("============================================================")

    # Directories and files to include
    include_files = [
        "Install-STeP-AI.bat",
        "Update-STeP-AI.bat",
        "Feedback-STeP-AI.bat",
        "Install-STeP-AI.command",
        "Update-STeP-AI.command",
        "Feedback-STeP-AI.command",
        "package.json",
        "README.md",
        "START-HERE.md",
        "START-PROMPT.txt",
        "culture.md",
    ]

    include_dirs = [
        "install",
        "bin",
        "src",
        "manifest",
        "skills",
        "rules",
        "docs",
    ]

    def add_file_to_zip(zf, fpath, arcname):
        str_arc = str(arcname).replace('\\', '/')
        zinfo = zipfile.ZipInfo.from_file(fpath, arcname=str_arc)
        if str_arc.endswith(('.sh', '.command')):
            zinfo.external_attr = 0o755 << 16  # Unix executable permissions rwxr-xr-x
        else:
            zinfo.external_attr = 0o644 << 16  # Unix regular file permissions rw-r--r--
        with open(fpath, 'rb') as src:
            data = src.read()
        # Windows PowerShell requires UTF-8 BOM to parse non-ASCII characters correctly
        if str_arc.endswith('.ps1') and not data.startswith(b'\xef\xbb\xbf'):
            data = b'\xef\xbb\xbf' + data
        zf.writestr(zinfo, data, compress_type=zipfile.ZIP_DEFLATED)

    file_count = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        # Add root files
        for fname in include_files:
            fpath = ROOT / fname
            if fpath.exists():
                add_file_to_zip(zf, fpath, fname)
                file_count += 1
            else:
                print(f"  [WARN] Missing file: {fname}")

        # Add directory contents
        for dname in include_dirs:
            dpath = ROOT / dname
            if not dpath.exists():
                print(f"  [WARN] Missing directory: {dname}")
                continue

            for root, _, files in os.walk(dpath):
                for f in files:
                    full_p = Path(root) / f
                    # Skip temporary files
                    if f.endswith((".pyc", ".DS_Store", ".tmp")) or "__pycache__" in str(full_p):
                        continue
                    arcname = full_p.relative_to(ROOT)
                    add_file_to_zip(zf, full_p, arcname)
                    file_count += 1

    size_kb = zip_path.stat().st_size / 1024
    print("\n✓ Package build successful!")
    print(f"  • Total files bundled: {file_count}")
    print(f"  • Archive size:        {size_kb:.1f} KB")
    print(f"  • Output file:         {zip_path}")
    print("============================================================\n")

if __name__ == "__main__":
    build_pilot_bundle()
