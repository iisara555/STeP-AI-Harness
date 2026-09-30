from __future__ import annotations

import io
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

from PIL import Image

from crosscheck import comparable_text

COMMON_TESSERACT_PATHS = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Users\%USERNAME%\AppData\Local\Programs\Tesseract-OCR\tesseract.exe",
    "/opt/homebrew/bin/tesseract",
    "/usr/local/bin/tesseract",
    "/usr/bin/tesseract",
)


def find_tesseract() -> str:
    explicit = os.environ.get("TESSERACT_CMD", "").strip()
    if explicit and Path(os.path.expandvars(explicit)).is_file():
        return os.path.expandvars(explicit)
    found = shutil.which("tesseract")
    if found:
        return found
    for candidate in COMMON_TESSERACT_PATHS:
        expanded = os.path.expandvars(candidate)
        if Path(expanded).is_file():
            return expanded
    return ""


def available_languages(command: str | None = None) -> set[str]:
    executable = command or find_tesseract()
    if not executable:
        return set()
    try:
        result = subprocess.run(
            [executable, "--list-langs"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=8,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except (OSError, subprocess.SubprocessError):
        return set()
    if result.returncode != 0:
        return set()
    return {
        line.strip()
        for line in result.stdout.splitlines()
        if line.strip() and not line.lower().startswith("list of available languages")
    }


def is_ready() -> bool:
    command = find_tesseract()
    if not command:
        return False
    languages = available_languages(command)
    return {"tha", "eng"}.issubset(languages)


def classify_text_kind(
    primary: str,
    tesseract: str,
    tesseract_confidence: float | None,
    handwriting: str = "",
) -> str:
    """Use independent OCR agreement only as a classification signal.

    Tesseract is strong evidence for printed text, not proof that text is handwritten.
    Handwriting is labelled likely only when the handwriting model produced a candidate
    and Tesseract was absent/weak or disagreed.
    """
    primary_key = comparable_text(primary)
    tesseract_key = comparable_text(tesseract)
    handwriting_key = comparable_text(handwriting)

    if tesseract_key and tesseract_confidence is not None and tesseract_confidence >= 0.55:
        if primary_key and primary_key == tesseract_key:
            return "printed-likely"
        if handwriting_key and handwriting_key == tesseract_key:
            return "printed-likely"

    if handwriting_key:
        if not tesseract_key or tesseract_confidence is None or tesseract_confidence < 0.35:
            return "handwriting-likely"
        if primary_key and handwriting_key == primary_key and handwriting_key != tesseract_key:
            return "handwriting-likely"

    if tesseract_key and primary_key and tesseract_key != primary_key:
        return "printed-conflict"
    return "uncertain"


class TesseractCrosscheck:
    """Optional Thai/English printed-text verifier using the local Tesseract binary."""

    def __init__(self, command: str | None = None) -> None:
        self.command = command or find_tesseract()
        if not self.command:
            raise FileNotFoundError("Tesseract executable was not found.")
        languages = available_languages(self.command)
        missing = {"tha", "eng"} - languages
        if missing:
            raise RuntimeError("Tesseract is missing language data: " + ", ".join(sorted(missing)))

    def read(self, image: Image.Image) -> dict[str, Any]:
        buffer = io.BytesIO()
        image.convert("RGB").save(buffer, format="PNG")
        try:
            result = subprocess.run(
                [
                    self.command,
                    "stdin",
                    "stdout",
                    "-l",
                    "tha+eng",
                    "--oem",
                    "1",
                    "--psm",
                    "7",
                    "tsv",
                ],
                input=buffer.getvalue(),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
                timeout=25,
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("Tesseract timed out.") from exc
        if result.returncode != 0:
            raise RuntimeError("Tesseract failed.")

        text = result.stdout.decode("utf-8", errors="replace")
        words: list[str] = []
        confidences: list[float] = []
        for index, line in enumerate(text.splitlines()):
            if index == 0:
                continue
            parts = line.split("\t")
            if len(parts) < 12:
                continue
            token = parts[11].strip()
            if not token:
                continue
            words.append(token)
            try:
                confidence = float(parts[10])
                if confidence >= 0:
                    confidences.append(confidence / 100.0)
            except ValueError:
                pass

        return {
            "text": " ".join(words).strip(),
            "confidence": round(sum(confidences) / len(confidences), 6) if confidences else None,
        }
