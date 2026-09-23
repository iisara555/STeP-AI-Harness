from __future__ import annotations

import json
import statistics
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import fitz
import numpy as np
from PIL import Image
from paddleocr import PaddleOCR


@dataclass(frozen=True)
class OCRConfig:
    low_confidence_threshold: float = 0.80
    handwriting_fallback: bool = False
    native_pdf_min_chars: int = 40
    render_dpi: int = 150


class LocalThaiOCR:
    """Local-first OCR engine for Thai/English documents.

    Heavy models are initialized lazily. No document bytes are sent to a remote API.
    PaddleOCR model files may be downloaded on first use if they are not already cached.
    """

    def __init__(self) -> None:
        self._ocr: PaddleOCR | None = None
        self._handwriting = None

    def _get_ocr(self) -> PaddleOCR:
        if self._ocr is None:
            self._ocr = PaddleOCR(
                lang="th",
                ocr_version="PP-OCRv5",
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
                device="cpu",
            )
        return self._ocr

    def _get_handwriting(self):
        if self._handwriting is None:
            from handwriting import ThaiHandwritingReader
            self._handwriting = ThaiHandwritingReader()
        return self._handwriting

    def process(self, path: Path, config: OCRConfig) -> dict[str, Any]:
        suffix = path.suffix.lower()
        warnings: list[str] = []

        if suffix == ".pdf":
            pages = self._process_pdf(path, config, warnings)
        else:
            image = Image.open(path).convert("RGB")
            page = self._ocr_image(image, 1, config, warnings)
            pages = [page]

        lines = [line for page in pages for line in page.get("lines", [])]
        scores = [line["confidence"] for line in lines if line.get("confidence") is not None]
        low = [line for line in lines if line.get("needs_review")]

        text_pages: list[str] = []
        for page in pages:
            if page["source"] == "native_pdf_text":
                text_pages.append(page.get("text", ""))
            else:
                text_pages.append("\n".join(
                    (line.get("handwriting_candidate") or line.get("text", "")).strip()
                    for line in page.get("lines", [])
                    if (line.get("handwriting_candidate") or line.get("text", "")).strip()
                ))

        return {
            "engine": "PaddleOCR PP-OCRv5 Thai Mobile",
            "local_only": True,
            "handwriting_fallback_requested": config.handwriting_fallback,
            "threshold": config.low_confidence_threshold,
            "summary": {
                "pages": len(pages),
                "recognized_lines": len(lines),
                "average_confidence": round(statistics.fmean(scores), 4) if scores else None,
                "needs_review": len(low),
            },
            "text": "\n\n".join(text_pages).strip(),
            "pages": pages,
            "warnings": warnings,
        }

    def _process_pdf(self, path: Path, config: OCRConfig, warnings: list[str]) -> list[dict[str, Any]]:
        doc = fitz.open(path)
        pages: list[dict[str, Any]] = []
        try:
            for index, page in enumerate(doc, start=1):
                native_text = page.get_text("text").strip()
                if len(native_text) >= config.native_pdf_min_chars:
                    pages.append({
                        "page": index,
                        "source": "native_pdf_text",
                        "text": native_text,
                        "lines": [],
                    })
                    continue

                scale = config.render_dpi / 72.0
                pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
                image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                pages.append(self._ocr_image(image, index, config, warnings))
        finally:
            doc.close()
        return pages

    def _ocr_image(
        self,
        image: Image.Image,
        page_number: int,
        config: OCRConfig,
        warnings: list[str],
    ) -> dict[str, Any]:
        ocr = self._get_ocr()
        outputs = ocr.predict(np.asarray(image))
        lines: list[dict[str, Any]] = []

        for output in outputs:
            payload = self._result_json(output)
            texts = payload.get("rec_texts") or []
            scores = payload.get("rec_scores") or []
            boxes = payload.get("rec_boxes") or []

            for idx, text in enumerate(texts):
                score = self._to_float(scores[idx]) if idx < len(scores) else None
                box = self._to_box(boxes[idx]) if idx < len(boxes) else None
                item: dict[str, Any] = {
                    "text": str(text),
                    "confidence": score,
                    "box": box,
                    "needs_review": score is None or score < config.low_confidence_threshold,
                }

                if config.handwriting_fallback and item["needs_review"] and box:
                    try:
                        crop = self._crop_box(image, box)
                        candidate = self._get_handwriting().read(crop)
                        if candidate:
                            item["handwriting_candidate"] = candidate
                    except ImportError:
                        self._add_warning(
                            warnings,
                            "Thai-TrOCR optional dependencies are not installed. "
                            "Run Install-Handwriting to enable the fallback.",
                        )
                    except Exception as exc:
                        self._add_warning(warnings, f"Thai-TrOCR fallback failed for one region: {exc}")

                lines.append(item)

        return {
            "page": page_number,
            "source": "ocr",
            "width": image.width,
            "height": image.height,
            "lines": lines,
        }

    @staticmethod
    def _result_json(output: Any) -> dict[str, Any]:
        payload = getattr(output, "json", None)
        if callable(payload):
            payload = payload()
        if payload is None and isinstance(output, dict):
            payload = output
        if isinstance(payload, str):
            payload = json.loads(payload)
        if not isinstance(payload, dict):
            raise RuntimeError("Unsupported PaddleOCR result format.")
        nested = payload.get("res")
        return nested if isinstance(nested, dict) else payload

    @staticmethod
    def _to_float(value: Any) -> float | None:
        try:
            return round(float(value), 6)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _to_box(value: Any) -> list[int] | None:
        try:
            coords = list(value)
            if len(coords) != 4:
                return None
            return [int(round(float(v))) for v in coords]
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _crop_box(image: Image.Image, box: list[int]) -> Image.Image:
        left, top, right, bottom = box
        pad_x = max(4, int((right - left) * 0.04))
        pad_y = max(4, int((bottom - top) * 0.15))
        return image.crop((
            max(0, left - pad_x),
            max(0, top - pad_y),
            min(image.width, right + pad_x),
            min(image.height, bottom + pad_y),
        ))

    @staticmethod
    def _add_warning(warnings: list[str], message: str) -> None:
        if message not in warnings:
            warnings.append(message)
