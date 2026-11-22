from __future__ import annotations

import argparse
import json
from pathlib import Path

from ocr_engine import OCRConfig, LocalThaiOCR


def main() -> None:
    parser = argparse.ArgumentParser(description="Run one local OCR request in an isolated process")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("threshold", type=float)
    parser.add_argument("handwriting", choices=["0", "1"])
    parser.add_argument("crosscheck", choices=["0", "1"])
    parser.add_argument("tesseract", choices=["0", "1"])
    parser.add_argument("engine", nargs="?", default="paddle", choices=["paddle", "typhoon"])
    args = parser.parse_args()

    if args.engine == "typhoon":
        # Imported only when asked, so a PaddleOCR-only reading never touches the Typhoon files.
        from typhoon_engine import TyphoonThaiOCR

        reader = TyphoonThaiOCR()
    else:
        reader = LocalThaiOCR()
    result = reader.process(
        args.input,
        OCRConfig(
            low_confidence_threshold=args.threshold,
            handwriting_fallback=args.handwriting == "1",
            crosscheck=args.crosscheck == "1",
            tesseract_crosscheck=args.tesseract == "1",
        ),
    )
    args.output.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
