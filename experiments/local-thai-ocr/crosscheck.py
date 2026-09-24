from __future__ import annotations

import unicodedata
from typing import Any

import numpy as np
from PIL import Image


def comparable_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    characters: list[str] = []
    for character in normalized:
        category = unicodedata.category(character)
        if category.startswith("N"):
            characters.append(str(unicodedata.digit(character, character)))
        elif category.startswith(("L", "M")):
            characters.append(character)
    return "".join(characters)


class EasyOCRCrosscheck:
    """Independent, optional Thai/English recognizer for detected text regions."""

    def __init__(self) -> None:
        try:
            import easyocr
        except ImportError as exc:
            raise ImportError("EasyOCR is missing. Run Install-Crosscheck first.") from exc
        self._reader = easyocr.Reader(
            ["th", "en"], gpu=False, detector=False, recognizer=True, verbose=False
        )

    def read_lines(self, image: Image.Image, boxes: list[list[int]]) -> list[dict[str, Any]]:
        if not boxes:
            return []
        horizontal = [[left, right, top, bottom] for left, top, right, bottom in boxes]
        results = self._reader.recognize(
            np.asarray(image.convert("RGB")),
            horizontal_list=horizontal,
            free_list=[],
            detail=1,
            batch_size=1,
            paragraph=False,
        )
        if len(results) != len(boxes):
            raise RuntimeError("EasyOCR returned a different number of text regions.")
        return [
            {"text": str(result[1]).strip(), "confidence": round(float(result[2]), 6)}
            for result in results
        ]
