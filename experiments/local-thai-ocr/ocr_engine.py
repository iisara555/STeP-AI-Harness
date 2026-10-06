from __future__ import annotations

import json
import math
import os
import statistics
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TYPE_CHECKING

import numpy as np
import pypdfium2 as pdfium
from PIL import Image, ImageOps
if TYPE_CHECKING:
    from paddleocr import PaddleOCR

MAX_OCR_IMAGE_SIDE = 2400
DETAIL_OCR_IMAGE_SIDE = 4800
OCR_TILE_SIDE = 1800
OCR_TILE_OVERLAP = 160
MAX_CROSSCHECK_LINES_PER_TILE = 80
MAX_CROSSCHECK_LINES_PER_REQUEST = 100
MAX_HANDWRITING_LINES_PER_REQUEST = 20
MAX_TESSERACT_LINES_PER_REQUEST = 80


@dataclass(frozen=True)
class OCRConfig:
    low_confidence_threshold: float = 0.80
    handwriting_fallback: bool = False
    crosscheck: bool = False
    tesseract_crosscheck: bool = False
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
        self._handwriting_failed = False
        self._handwriting_lines_used = 0
        self._crosscheck = None
        self._crosscheck_failed = False
        self._crosscheck_lines_used = 0
        self._tesseract = None
        self._tesseract_failed = False
        self._tesseract_lines_used = 0

    def _get_ocr(self) -> PaddleOCR:
        if self._ocr is None:
            # Native-text PDFs need no model import, host check or Paddle startup.
            from paddleocr import PaddleOCR
            # Installers ship the two models; STEP_OCR_MODEL_DIR points at them so no download is needed.
            bundled = Path(os.environ.get("STEP_OCR_MODEL_DIR", ""))
            model_dirs: dict[str, str] = {}
            if os.environ.get("STEP_OCR_MODEL_DIR") and (bundled / "PP-OCRv5_mobile_det").is_dir() and (bundled / "th_PP-OCRv5_mobile_rec").is_dir():
                model_dirs = {
                    "text_detection_model_dir": str(bundled / "PP-OCRv5_mobile_det"),
                    "text_recognition_model_dir": str(bundled / "th_PP-OCRv5_mobile_rec"),
                }
            self._ocr = PaddleOCR(
                text_detection_model_name="PP-OCRv5_mobile_det",
                text_recognition_model_name="th_PP-OCRv5_mobile_rec",
                **model_dirs,
                text_det_limit_type="max",
                text_det_limit_side_len=960,
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
                device="cpu",
                cpu_threads=max(1, min(4, os.cpu_count() or 1)),
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

    def _get_tesseract(self):
        if self._tesseract is None:
            from tesseract_check import TesseractCrosscheck

            self._tesseract = TesseractCrosscheck()
        return self._tesseract

    def process(self, path: Path, config: OCRConfig) -> dict[str, Any]:
        started = time.perf_counter()
        self._crosscheck_lines_used = 0
        self._crosscheck_failed = False
        self._handwriting_lines_used = 0
        self._handwriting_failed = False
        self._tesseract_lines_used = 0
        self._tesseract_failed = False
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
                orientation = source.getexif().get(274, 1)
                image = ImageOps.exif_transpose(source).convert("RGB")
                if orientation in (5, 6, 7, 8):
                    original_size = original_size[::-1]
                if orientation in range(2, 9):
                    self._add_warning(warnings, "EXIF orientation applied before OCR; coordinates refer to the oriented image.")
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
            "tesseract_crosscheck_requested": config.tesseract_crosscheck,
            "threshold": config.low_confidence_threshold,
            "summary": {
                "pages": len(pages),
                "recognized_lines": len(lines),
                "average_confidence": round(statistics.fmean(scores), 4) if scores else None,
                "needs_review": len(low),
                "low_confidence_lines": sum(bool(line.get("low_confidence")) for line in lines),
                "crosschecked_lines": len(crosschecked),
                "tesseract_checked_lines": sum(bool(line.get("tesseract_status")) for line in lines),
                "handwriting_candidates": sum(bool(line.get("handwriting_candidate")) for line in lines),
                "printed_likely_lines": sum(line.get("text_kind") == "printed-likely" for line in lines),
                "handwriting_likely_lines": sum(line.get("text_kind") == "handwriting-likely" for line in lines),
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
        prepared = self._normalize_low_contrast(image, warnings)
        normalized_contrast = prepared is not image
        image = prepared
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
            "preprocessing": ["low-contrast-autocontrast"] if normalized_contrast else [],
            "lines": lines,
        }

    @staticmethod
    def _normalize_low_contrast(image: Image.Image, warnings: list[str]) -> Image.Image:
        # A cheap single-pass stretch for faded thermal paper only. Flat pages
        # and normal-contrast photographs remain unchanged; no thresholding,
        # sharpened glyphs, extra inference or modifications to the source file.
        histogram = image.convert("L").histogram()
        total = sum(histogram)
        def percentile(fraction):
            seen = 0
            for value, count in enumerate(histogram):
                seen += count
                if seen >= total * fraction:
                    return value
            return 255
        span = percentile(0.995) - percentile(0.005)
        if not 12 <= span < 96:
            return image
        LocalThaiOCR._add_warning(warnings, "Low-contrast image normalized before OCR; verify faded text against the original.")
        return ImageOps.autocontrast(image, cutoff=0, preserve_tone=True)

    def _ocr_tiled(self, image: Image.Image, config: OCRConfig, warnings: list[str]) -> list[dict[str, Any]]:
        columns = math.ceil(image.width / OCR_TILE_SIDE)
        rows = math.ceil(image.height / OCR_TILE_SIDE)
        lines: list[dict[str, Any]] = []
        overlap_lines: list[dict[str, Any]] = []

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
                        line["box"] = box
                        if line.get("polygon"):
                            line["polygon"] = [[x + crop_left, y + crop_top] for x, y in line["polygon"]]
                        if not (core_left <= center_x < core_right and core_top <= center_y < core_bottom):
                            overlap_lines.append(line)
                            continue
                    lines.append(line)

        # A neighbouring tile may find a seam line that its owning tile misses.
        # Recover it conservatively instead of dropping it by center ownership.
        for line in overlap_lines:
            box = line["box"]
            def overlaps(existing):
                other = existing.get("box")
                if not other:
                    return False
                intersection = max(0, min(box[2], other[2]) - max(box[0], other[0])) * max(0, min(box[3], other[3]) - max(box[1], other[1]))
                area = min((box[2] - box[0]) * (box[3] - box[1]), (other[2] - other[0]) * (other[3] - other[1]))
                return area > 0 and intersection / area >= 0.5
            matching = [existing for existing in lines if overlaps(existing)]
            if matching:
                from crosscheck import comparable_text
                for existing in matching:
                    if comparable_text(existing['text']) == comparable_text(line['text']):
                        continue
                    alternatives = existing.setdefault('tile_candidates', [])
                    if not any(item['text'] == line['text'] for item in alternatives):
                        alternatives.append({key: line.get(key) for key in ('text', 'confidence', 'box')})
                    existing['needs_review'] = True
                    self._add_warning(warnings, "Overlapping tiles read a region differently; both readings are retained for source comparison.")
                continue
            line["needs_review"] = True
            line["tile_overlap_recovery"] = True
            lines.append(line)
            self._add_warning(warnings, "Recovered an overlap-only OCR line; verify it against the original image.")

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
            polygons = payload.get("rec_polys") or []

            for idx, text in enumerate(texts):
                score = self._to_float(scores[idx]) if idx < len(scores) else None
                box = self._to_box(boxes[idx]) if idx < len(boxes) else None
                item: dict[str, Any] = {
                    "text": str(text),
                    "confidence": score,
                    "box": box,
                    "polygon": self._to_polygon(polygons[idx]) if idx < len(polygons) else None,
                    "low_confidence": score is None or score < config.low_confidence_threshold,
                    "needs_review": score is None or score < config.low_confidence_threshold,
                }

                lines.append(item)
        if config.crosscheck and lines:
            self._crosscheck_lines(image, lines, warnings)
        if config.tesseract_crosscheck and lines:
            self._tesseract_candidates(image, lines, warnings)
        if config.handwriting_fallback and lines:
            self._handwriting_candidates(image, lines, warnings)
        if lines:
            self._classify_text_kinds(lines)
        return lines

    def _tesseract_candidates(
        self, image: Image.Image, lines: list[dict[str, Any]], warnings: list[str]
    ) -> None:
        if self._tesseract_failed:
            return

        remaining = MAX_TESSERACT_LINES_PER_REQUEST - self._tesseract_lines_used
        if remaining <= 0:
            self._add_warning(warnings, "Tesseract reached the per-document line limit.")
            return

        priority = (
            [index for index, line in enumerate(lines) if line.get("low_confidence")]
            + [
                index for index, line in enumerate(lines)
                if any(character.isdigit() for character in str(line.get("text", "")))
            ]
            + list(range(min(20, len(lines))))
            + list(range(max(0, len(lines) - 20), len(lines)))
        )
        selected: list[int] = []
        for index in priority:
            if index not in selected and lines[index].get("box"):
                selected.append(index)
            if len(selected) >= remaining:
                break

        if not selected:
            return
        if len(selected) < sum(bool(line.get("box")) for line in lines):
            self._add_warning(
                warnings,
                "Tesseract cross-check was limited to selected low-confidence, numeric and edge lines.",
            )

        try:
            reader = self._get_tesseract()
        except (FileNotFoundError, RuntimeError):
            self._tesseract_failed = True
            self._add_warning(
                warnings,
                "Tesseract Thai/English cross-check is not available on this computer.",
            )
            return

        from crosscheck import comparable_text

        for index in selected:
            line = lines[index]
            self._tesseract_lines_used += 1
            try:
                crop = self._crop_box(image, line["box"])
                result = reader.read(crop)
                alternative = str(result.get("text", "")).strip()
                confidence = result.get("confidence")
                line["tesseract_candidate"] = alternative
                line["tesseract_confidence"] = confidence
                if not alternative or confidence is None or confidence < 0.20:
                    line["tesseract_status"] = "uncertain"
                elif comparable_text(line["text"]) == comparable_text(alternative):
                    line["tesseract_status"] = "agree"
                else:
                    line["tesseract_status"] = "disagree"
                    line["needs_review"] = True
            except Exception as exc:
                line["tesseract_status"] = "error"
                self._add_warning(
                    warnings,
                    f"Tesseract cross-check failed for one region: {type(exc).__name__}.",
                )

        self._add_warning(
            warnings,
            "Tesseract is used only as an independent printed-text/number check; it is not the handwriting authority.",
        )

    @staticmethod
    def _classify_text_kinds(lines: list[dict[str, Any]]) -> None:
        from tesseract_check import classify_text_kind

        for line in lines:
            line["text_kind"] = classify_text_kind(
                str(line.get("text", "")),
                str(line.get("tesseract_candidate", "")),
                line.get("tesseract_confidence"),
                str(line.get("handwriting_candidate", "")),
            )
            candidates = [
                {
                    "engine": "paddle",
                    "text": str(line.get("text", "")),
                    "confidence": line.get("confidence"),
                }
            ]
            if line.get("tesseract_candidate"):
                candidates.append(
                    {
                        "engine": "tesseract",
                        "text": line["tesseract_candidate"],
                        "confidence": line.get("tesseract_confidence"),
                    }
                )
            if line.get("crosscheck_candidate"):
                candidates.append(
                    {
                        "engine": "easyocr",
                        "text": line["crosscheck_candidate"],
                        "confidence": line.get("crosscheck_confidence"),
                    }
                )
            if line.get("handwriting_candidate"):
                candidates.append(
                    {
                        "engine": "thai-trocr",
                        "text": line["handwriting_candidate"],
                        "confidence": None,
                        "unverified": True,
                    }
                )
            line["fusion_candidates"] = candidates

    def _handwriting_candidates(
        self, image: Image.Image, lines: list[dict[str, Any]], warnings: list[str]
    ) -> None:
        if self._handwriting_failed:
            return
        selected = [line for line in lines if line.get("box") and line["low_confidence"]]
        selected.extend(
            line for line in lines
            if line.get("box") and not line["low_confidence"] and line.get("crosscheck_status") == "disagree"
        )
        remaining = MAX_HANDWRITING_LINES_PER_REQUEST - self._handwriting_lines_used
        if remaining <= 0:
            if selected:
                self._add_warning(warnings, "Thai-TrOCR reached the per-document line limit.")
            return
        if len(selected) > remaining:
            self._add_warning(warnings, "Thai-TrOCR was limited to selected lines on this document.")

        for line in selected[:remaining]:
            self._handwriting_lines_used += 1
            try:
                crop = self._crop_box(image, line["box"])
                candidate = self._get_handwriting().read(crop)
                if candidate:
                    line["handwriting_candidate"] = candidate
                    line["handwriting_candidate_unverified"] = True
                    self._add_warning(
                        warnings,
                        "Thai-TrOCR candidates are second opinions only and never replace OCR text automatically.",
                    )
            except ImportError:
                self._handwriting_failed = True
                self._add_warning(
                    warnings,
                    "Thai-TrOCR optional dependencies are not installed. "
                    "Run Install-Handwriting to enable the fallback.",
                )
                return
            except Exception as exc:
                self._add_warning(warnings, f"Thai-TrOCR fallback failed for one region: {type(exc).__name__}.")

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
            confidence = float(value)
            return round(confidence, 6) if math.isfinite(confidence) and 0 <= confidence <= 1 else None
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
    def _to_polygon(value: Any) -> list[list[int]] | None:
        try:
            points = [[float(x), float(y)] for x, y in value]
            if len(points) != 4 or not all(math.isfinite(v) for point in points for v in point):
                return None
            return [[int(round(x)), int(round(y))] for x, y in points]
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
