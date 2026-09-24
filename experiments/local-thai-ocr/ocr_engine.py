from __future__ import annotations

import json
import math
import statistics
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pypdfium2 as pdfium
from PIL import Image
from paddleocr import PaddleOCR

MAX_OCR_IMAGE_SIDE = 2400
DETAIL_OCR_IMAGE_SIDE = 4800
OCR_TILE_SIDE = 1800
OCR_TILE_OVERLAP = 160
MAX_CROSSCHECK_LINES_PER_TILE = 80
MAX_CROSSCHECK_LINES_PER_REQUEST = 100


@dataclass(frozen=True)
class OCRConfig:
    low_confidence_threshold: float = 0.80
    handwriting_fallback: bool = False
    crosscheck: bool = False
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
        self._crosscheck = None
        self._crosscheck_failed = False
        self._crosscheck_lines_used = 0

    def _get_ocr(self) -> PaddleOCR:
        if self._ocr is None:
            self._ocr = PaddleOCR(
                text_detection_model_name="PP-OCRv5_mobile_det",
                text_recognition_model_name="th_PP-OCRv5_mobile_rec",
                text_det_limit_type="max",
                text_det_limit_side_len=960,
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
                device="cpu",
                cpu_threads=4,
                # PaddlePaddle 3.3.0 oneDNN fails during CPU text detection.
                enable_mkldnn=False,
            )
        return self._ocr

    def _get_handwriting(self):
        if self._handwriting is None:
            from handwriting import ThaiHandwritingReader
            self._handwriting = ThaiHandwritingReader()
        return self._handwriting

    def _get_crosscheck(self):
        if self._crosscheck is None:
            from crosscheck import EasyOCRCrosscheck

            self._crosscheck = EasyOCRCrosscheck()
        return self._crosscheck

    def process(self, path: Path, config: OCRConfig) -> dict[str, Any]:
        started = time.perf_counter()
        self._crosscheck_lines_used = 0
        self._crosscheck_failed = False
        suffix = path.suffix.lower()
        warnings: list[str] = []

        if suffix == ".pdf":
            pages = self._process_pdf(path, config, warnings)
        else:
            with Image.open(path) as source:
                original_size = source.size
                if source.format == "JPEG":
                    source.draft("RGB", (DETAIL_OCR_IMAGE_SIDE, DETAIL_OCR_IMAGE_SIDE))
                source.thumbnail((DETAIL_OCR_IMAGE_SIDE, DETAIL_OCR_IMAGE_SIDE), Image.Resampling.LANCZOS)
                image = source.convert("RGB")
            pages = [self._ocr_image(image, 1, config, warnings, original_size=original_size, detail=True)]

        lines = [line for page in pages for line in page.get("lines", [])]
        scores = [line["confidence"] for line in lines if line.get("confidence") is not None]
        low = [line for line in lines if line.get("needs_review")]
        disagreements = [line for line in lines if line.get("crosscheck_status") == "disagree"]
        crosschecked = [line for line in lines if line.get("crosscheck_status")]

        text_pages: list[str] = []
        for page in pages:
            if page["source"] == "native_pdf_text":
                text_pages.append(page.get("text", ""))
            else:
                text_pages.append("\n".join(
                    line.get("text", "").strip()
                    for line in page.get("lines", [])
                    if line.get("text", "").strip()
                ))

        return {
            "engine": "PaddleOCR PP-OCRv5 Thai Mobile",
            "local_only": True,
            "handwriting_fallback_requested": config.handwriting_fallback,
            "crosscheck_requested": config.crosscheck,
            "threshold": config.low_confidence_threshold,
            "summary": {
                "pages": len(pages),
                "recognized_lines": len(lines),
                "average_confidence": round(statistics.fmean(scores), 4) if scores else None,
                "needs_review": len(low),
                "low_confidence_lines": sum(bool(line.get("low_confidence")) for line in lines),
                "crosschecked_lines": len(crosschecked),
                "disagreements": len(disagreements),
                "elapsed_seconds": round(time.perf_counter() - started, 3),
            },
            "text": "\n\n".join(text_pages).strip(),
            "pages": pages,
            "warnings": warnings,
        }

    def _process_pdf(self, path: Path, config: OCRConfig, warnings: list[str]) -> list[dict[str, Any]]:
        pdf = pdfium.PdfDocument(str(path))
        pages: list[dict[str, Any]] = []
        try:
            for page_index in range(len(pdf)):
                page = pdf[page_index]
                try:
                    textpage = page.get_textpage()
                    try:
                        native_text = textpage.get_text_bounded().replace("\r\n", "\n").strip()
                    finally:
                        textpage.close()

                    # A short text layer can be just a page number on a scanned page.
                    if native_text and (
                        len(native_text) >= config.native_pdf_min_chars
                        or not self._has_large_page_image(page)
                    ):
                        pages.append({
                            "page": page_index + 1,
                            "source": "native_pdf_text",
                            "text": native_text,
                            "lines": [],
                        })
                        continue

                    width, height = page.get_size()
                    scale = config.render_dpi / 72.0
                    if max(width, height) > 0:
                        scale = min(scale, MAX_OCR_IMAGE_SIDE / max(width, height))
                    bitmap = page.render(scale=scale)
                    try:
                        image = bitmap.to_pil().convert("RGB")
                    finally:
                        bitmap.close()
                    pages.append(self._ocr_image(image, page_index + 1, config, warnings))
                finally:
                    page.close()
        finally:
            pdf.close()
        return pages

    @staticmethod
    def _has_large_page_image(page: pdfium.PdfPage) -> bool:
        width, height = page.get_size()
        page_area = width * height
        if page_area <= 0:
            return False

        for image in page.get_objects(filter=[pdfium.raw.FPDF_PAGEOBJ_IMAGE]):
            left, bottom, right, top = image.get_bounds()
            image_width = max(0.0, min(right, width) - max(left, 0.0))
            image_height = max(0.0, min(top, height) - max(bottom, 0.0))
            if image_width * image_height >= page_area * 0.5:
                return True
        return False

    def _ocr_image(
        self,
        image: Image.Image,
        page_number: int,
        config: OCRConfig,
        warnings: list[str],
        original_size: tuple[int, int] | None = None,
        detail: bool = False,
    ) -> dict[str, Any]:
        original_width, original_height = original_size or image.size
        limit = DETAIL_OCR_IMAGE_SIDE if detail else MAX_OCR_IMAGE_SIDE
        if max(image.size) > limit:
            image.thumbnail((limit, limit), Image.Resampling.LANCZOS)
        if image.size != (original_width, original_height):
            self._add_warning(
                warnings,
                f"Image resized from {original_width}x{original_height} to "
                f"{image.width}x{image.height} before OCR; verify small text carefully.",
            )
        if detail and max(image.size) > MAX_OCR_IMAGE_SIDE:
            lines = self._ocr_tiled(image, config, warnings)
            self._add_warning(warnings, "High-detail tiled OCR was used; verify critical fields against the original receipt.")
        else:
            lines = self._predict_lines(image, config, warnings)

        return {
            "page": page_number,
            "source": "ocr",
            "width": image.width,
            "height": image.height,
            "original_width": original_width,
            "original_height": original_height,
            "lines": lines,
        }

    def _ocr_tiled(self, image: Image.Image, config: OCRConfig, warnings: list[str]) -> list[dict[str, Any]]:
        columns = math.ceil(image.width / OCR_TILE_SIDE)
        rows = math.ceil(image.height / OCR_TILE_SIDE)
        lines: list[dict[str, Any]] = []

        for row in range(rows):
            core_top = image.height * row // rows
            core_bottom = image.height * (row + 1) // rows
            for column in range(columns):
                core_left = image.width * column // columns
                core_right = image.width * (column + 1) // columns
                crop_left = max(0, core_left - OCR_TILE_OVERLAP)
                crop_top = max(0, core_top - OCR_TILE_OVERLAP)
                crop_right = min(image.width, core_right + OCR_TILE_OVERLAP)
                crop_bottom = min(image.height, core_bottom + OCR_TILE_OVERLAP)
                tile = image.crop((crop_left, crop_top, crop_right, crop_bottom))

                for line in self._predict_lines(tile, config, warnings):
                    box = line.get("box")
                    if box:
                        box = [box[0] + crop_left, box[1] + crop_top, box[2] + crop_left, box[3] + crop_top]
                        center_x = (box[0] + box[2]) / 2
                        center_y = (box[1] + box[3]) / 2
                        if not (core_left <= center_x < core_right and core_top <= center_y < core_bottom):
                            continue
                        line["box"] = box
                    lines.append(line)

        lines.sort(key=lambda line: (
            (line["box"][1] + line["box"][3]) / 2 if line.get("box") else image.height,
            line["box"][0] if line.get("box") else 0,
        ))
        return lines

    def _predict_lines(
        self, image: Image.Image, config: OCRConfig, warnings: list[str]
    ) -> list[dict[str, Any]]:
        outputs = self._get_ocr().predict(np.asarray(image))
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
                    "low_confidence": score is None or score < config.low_confidence_threshold,
                    "needs_review": score is None or score < config.low_confidence_threshold,
                }

                if config.handwriting_fallback and item["needs_review"] and box:
                    try:
                        crop = self._crop_box(image, box)
                        candidate = self._get_handwriting().read(crop)
                        if candidate:
                            item["handwriting_candidate"] = candidate
                            item["handwriting_candidate_unverified"] = True
                            self._add_warning(
                                warnings,
                                "Thai-TrOCR candidates are second opinions only and never replace OCR text automatically.",
                            )
                    except ImportError:
                        self._add_warning(
                            warnings,
                            "Thai-TrOCR optional dependencies are not installed. "
                            "Run Install-Handwriting to enable the fallback.",
                        )
                    except Exception as exc:
                        self._add_warning(warnings, f"Thai-TrOCR fallback failed for one region: {exc}")

                lines.append(item)
        if config.crosscheck and lines:
            self._crosscheck_lines(image, lines, warnings)
        return lines

    def _crosscheck_lines(
        self, image: Image.Image, lines: list[dict[str, Any]], warnings: list[str]
    ) -> None:
        if self._crosscheck_failed:
            return
        remaining = MAX_CROSSCHECK_LINES_PER_REQUEST - self._crosscheck_lines_used
        if remaining <= 0:
            self._add_warning(warnings, "EasyOCR cross-check reached the per-document line limit.")
            return
        priority = (
            [index for index, line in enumerate(lines) if line["low_confidence"]]
            + list(range(max(0, len(lines) - 20), len(lines)))
            + list(range(min(20, len(lines))))
            + list(range(len(lines)))
        )
        selected: list[int] = []
        for index in priority:
            if index not in selected and lines[index].get("box"):
                selected.append(index)
            if len(selected) == min(MAX_CROSSCHECK_LINES_PER_TILE, remaining):
                break
        selected.sort()
        if len(selected) < sum(bool(line.get("box")) for line in lines):
            self._add_warning(warnings, "EasyOCR cross-check was limited to selected lines on a dense page.")
        if not selected:
            return

        try:
            boxes = [self._padded_box(image, lines[index]["box"]) for index in selected]
            candidates = self._get_crosscheck().read_lines(image, boxes)
            if len(candidates) != len(selected):
                raise RuntimeError("EasyOCR returned a different number of text regions.")
        except ImportError:
            self._crosscheck_failed = True
            self._add_warning(warnings, "EasyOCR cross-check is not installed. Run Install-Crosscheck first.")
            return
        except Exception as exc:
            self._crosscheck_failed = True
            self._add_warning(warnings, f"EasyOCR cross-check could not run: {type(exc).__name__}.")
            return

        from crosscheck import comparable_text

        for index, candidate in zip(selected, candidates):
            line = lines[index]
            alternative = candidate["text"]
            confidence = candidate["confidence"]
            line["crosscheck_candidate"] = alternative
            line["crosscheck_confidence"] = confidence
            if not alternative or confidence < 0.20:
                line["crosscheck_status"] = "uncertain"
            elif comparable_text(line["text"]) == comparable_text(alternative):
                line["crosscheck_status"] = "agree"
            else:
                line["crosscheck_status"] = "disagree"
                line["needs_review"] = True

        self._crosscheck_lines_used += len(selected)
        self._add_warning(
            warnings,
            "EasyOCR results are independent second opinions. Differences require checking the receipt image.",
        )

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
    def _padded_box(image: Image.Image, box: list[int]) -> list[int]:
        left, top, right, bottom = box
        pad_x = max(4, int((right - left) * 0.04))
        pad_y = max(4, int((bottom - top) * 0.15))
        return [
            max(0, left - pad_x),
            max(0, top - pad_y),
            min(image.width, right + pad_x),
            min(image.height, bottom + pad_y),
        ]

    @staticmethod
    def _add_warning(warnings: list[str], message: str) -> None:
        if message not in warnings:
            warnings.append(message)
