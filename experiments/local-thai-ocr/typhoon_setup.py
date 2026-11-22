"""Where the optional Typhoon OCR files live. Kept free of model imports so the service's health check stays light."""
from __future__ import annotations

import os
from pathlib import Path

# Files the Desktop installer puts under STEP_TYPHOON_DIR: llama/<llama-server>, models/<model>, models/<mmproj>.
MODEL_FILE = "typhoon-ocr2-0.8b-Q8_0.gguf"
MMPROJ_FILE = "mmproj-typhoon-ocr2-0.8b-f16.gguf"


def typhoon_dir() -> Path | None:
    value = os.environ.get("STEP_TYPHOON_DIR", "").strip()
    return Path(value) if value else None


def typhoon_files(folder: Path | None = None) -> dict[str, Path] | None:
    folder = folder or typhoon_dir()
    if not folder or not folder.is_dir():
        return None
    name = "llama-server.exe" if os.name == "nt" else "llama-server"
    llama = folder / "llama"
    # Release archives keep llama-server at the top or in one sub-folder (build/bin).
    servers = [llama / name, *sorted(llama.glob(f"*/{name}")), *sorted(llama.glob(f"*/*/{name}"))]
    server = next((path for path in servers if path.is_file()), None)
    model, mmproj = folder / "models" / MODEL_FILE, folder / "models" / MMPROJ_FILE
    if not server or not model.is_file() or not mmproj.is_file():
        return None
    return {"server": server, "model": model, "mmproj": mmproj}


def typhoon_installed() -> bool:
    return typhoon_files() is not None
