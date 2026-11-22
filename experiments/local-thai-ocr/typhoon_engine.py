"""Typhoon OCR V2 0.8B reader for the local OCR service.

Typhoon reads the whole page with a small vision-language model run by llama.cpp's ``llama-server`` on this
computer (loopback only, a fresh API key per request). It reads Thai far better than PaddleOCR, but a language model
can write a plausible number that is not on the page, so every number it reads is checked against PaddleOCR's
reading of the same page. A line whose numbers PaddleOCR does not confirm is flagged for review, with PaddleOCR's
text offered beside it. If Typhoon is not installed, fails or runs out of time, the page keeps PaddleOCR's result.

This module adds to ``ocr_engine`` and does not change it, so installed Paddle components stay current.
"""
from __future__ import annotations

import base64
import html
import io
import json
import os
import re
import secrets
import socket
import subprocess
import time
import urllib.error
import urllib.request
from dataclasses import replace
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from PIL import Image

from crosscheck import comparable_text
from ocr_engine import LocalThaiOCR, OCRConfig
from typhoon_setup import typhoon_files

ENGINE_NAME = "Typhoon OCR V2 0.8B + PaddleOCR number check"
# Prompt, image preparation and decoding of the official typhoon-ocr2 client 0.2.0 (Apache-2.0), so the model reads
# as it did in our benchmark (2026-11-20, ik-node-01).
PROMPT = """- Extract layout information from the provided PDF image.
- For each layout element, output its bbox, category, and the text content within the bbox.
- Bbox format: [x1, y1, x2, y2].
- Allowed layout categories: ['header', 'title', 'text', 'figure', 'table', 'formula', 'figure_caption', 'table_caption', 'formula_caption', 'figure_footnote', 'table_footnote', 'page_footnote', 'footer'].
- Text extraction and formatting:
  1) For 'figure', the text field must be an empty string.
  2) For 'formula', format text as LaTeX.
  3) For 'table', format text as HTML.
  4) For all other categories (e.g., text, title), format text as Markdown.
- The output text must be exactly the original text from the image, with no translation or rewriting.
- Sort all layout elements in human reading order.
- Final output must be a single JSON object."""
# Required by the model card: small images are read poorly, Thai text most of all.
MIN_LONG_SIDE = 1600
# The client renders PDF pages at this long side. Larger photos are brought down to it: the server would shrink them
# anyway, and each 32x32 px is one image token, so a 4800 px page would take minutes on a laptop CPU.
MAX_LONG_SIDE = 2048
# Our benchmark used 8192: every page finished well inside it, and a looping answer stops sooner.
MAX_TOKENS = 8192
CONTEXT_TOKENS = 40960
IMAGE_MAX_TOKENS = 16384
SERVER_START_SECONDS = 180
_threads = os.environ.get("STEP_TYPHOON_THREADS", "").strip()
THREADS = _threads if _threads.isdigit() else ""
# A request (all pages) gets this long for Typhoon; later pages keep PaddleOCR's reading. app.py waits longer.
REQUEST_BUDGET_SECONDS = int(os.environ.get("STEP_TYPHOON_BUDGET_SECONDS", "780"))
SKIPPED_CATEGORIES = {"figure"}
# Numbers worth checking: amounts with satang, and anything with three or more digits (tax IDs, receipt numbers,
# dates, totals). A lone "1" or "2" (a quantity) is too short for PaddleOCR's reading to confirm or refute it.
NUMBER = re.compile(r"\d[\d.,/-]*\d|\d")


class TyphoonError(RuntimeError):
    pass


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


class LlamaServer:
    """One llama-server for one OCR request, on a loopback port with a one-time API key."""

    def __init__(self, files: dict[str, Path]) -> None:
        self.files = files
        self.process: subprocess.Popen | None = None
        self.port = 0
        self.key = ""

    def command(self) -> list[str]:
        return [
            str(self.files["server"]),
            "-m", str(self.files["model"]),
            "--mmproj", str(self.files["mmproj"]),
            "--host", "127.0.0.1",
            "--port", str(self.port),
            "--api-key", self.key,
            "--jinja",
            "--reasoning", "off",
            "-c", str(CONTEXT_TOKENS),
            "--image-max-tokens", str(IMAGE_MAX_TOKENS),
            "-np", "1",
            # A server container limited to N CPUs sets this; on a laptop llama.cpp picks its own thread count.
            *(["-t", THREADS, "-tb", THREADS] if THREADS else []),
        ]

    def start(self) -> None:
        self.port, self.key = _free_port(), secrets.token_urlsafe(24)
        flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        # Its log can hold the page text; send it nowhere.
        self.process = subprocess.Popen(
            self.command(),
            cwd=self.files["server"].parent,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=flags,
        )
        deadline = time.monotonic() + SERVER_START_SECONDS
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                raise TyphoonError(f"Typhoon OCR stopped while loading (exit code {self.process.returncode}).")
            try:
                with urllib.request.urlopen(self._request("/health"), timeout=2) as response:
                    if response.status == 200:
                        return
            except (urllib.error.URLError, OSError):
                pass
            time.sleep(0.5)
        self.stop()
        raise TyphoonError("Typhoon OCR did not start in time.")

    def _request(self, path: str, body: bytes | None = None) -> urllib.request.Request:
        request = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", data=body)
        request.add_header("Authorization", f"Bearer {self.key}")
        if body is not None:
            request.add_header("Content-Type", "application/json")
        return request

    def chat(self, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
        if not self.process or self.process.poll() is not None:
            raise TyphoonError("Typhoon OCR is not running.")
        body = json.dumps(payload).encode("utf-8")
        try:
            with urllib.request.urlopen(self._request("/v1/chat/completions", body), timeout=max(1.0, timeout)) as response:
                return json.loads(response.read())
        except (TimeoutError, socket.timeout) as exc:
            raise TyphoonError("Typhoon OCR took too long on this page.") from exc
        except (urllib.error.URLError, OSError, ValueError) as exc:
            raise TyphoonError("Typhoon OCR did not answer.") from exc

    def stop(self) -> None:
        process, self.process = self.process, None
        if not process or process.poll() is not None:
            return
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def prepare_image(image: Image.Image) -> Image.Image:
    """Enlarge a page whose long side is under 1,600 px (as the client does); bring a very large one down to 2,048."""
    image = image.convert("RGB")
    long_side = max(image.size)
    target = MIN_LONG_SIDE if long_side < MIN_LONG_SIDE else min(long_side, MAX_LONG_SIDE)
    if target != long_side:
        scale = target / long_side
        size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
        image = image.resize(size, Image.Resampling.LANCZOS)
    return image


def request_payload(image: Image.Image) -> dict[str, Any]:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    data = base64.b64encode(buffer.getvalue()).decode("ascii")
    return {
        "model": "typhoon-ocr2",
        "max_tokens": MAX_TOKENS,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{data}"}},
                {"type": "text", "text": PROMPT},
            ],
        }],
        "temperature": 0.0,
        "top_p": 1.0,
    }


_FENCE = re.compile(r"```(?:json)?\s*\n(.*?)(?:\n```|$)", re.DOTALL)
_DECODER = json.JSONDecoder()


def parse_blocks(content: str) -> list[dict[str, Any]]:
    """Read the model's JSON list of {bbox, category, text}, as the client's parse_elements does.

    Unlike the client, an answer that is not a complete list is refused rather than trimmed: a cut-off answer is where a
    small model starts repeating or inventing text.
    """
    match = _FENCE.search(content)
    text = (match.group(1) if match else content).strip()
    if text.endswith("```"):
        text = text[:-3].rstrip()
    try:
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            if not text.startswith(("[", "{")):
                raise
            data, end = _DECODER.raw_decode(text)
            if text[end:].lstrip().startswith((",", "[", "{")):
                raise
    except (ValueError, RecursionError) as exc:
        raise TyphoonError("Typhoon OCR returned an answer that could not be read.") from exc
    if isinstance(data, dict):
        # The prompt asks for "a JSON object"; accept {"...": [elements]} or a single element.
        lists = [value for value in data.values() if isinstance(value, list)]
        if ("bbox" in data or "category" in data) and all(key == "bbox" for key, value in data.items() if isinstance(value, list)):
            data = [data]
        else:
            data = lists[0] if len(lists) == 1 else [data]
    if not isinstance(data, list):
        raise TyphoonError("Typhoon OCR returned an answer that could not be read.")
    blocks = [block for block in data if isinstance(block, dict)]
    if data and not blocks:
        raise TyphoonError("Typhoon OCR returned an answer that could not be read.")
    return blocks


class _TableRows(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[list[str]] = []
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag == "tr":
            self._row = []
        elif tag in {"td", "th"}:
            self._cell = []
        elif tag == "br" and self._cell is not None:
            self._cell.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"td", "th"} and self._cell is not None:
            if self._row is None:
                self._row = []
            self._row.append(" ".join("".join(self._cell).split()))
            self._cell = None
        elif tag == "tr" and self._row is not None:
            self.rows.append(self._row)
            self._row = None

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)


def text_rows(text: str) -> list[str]:
    """One reading line per table row (label and amount stay together) or per text line."""
    if re.search(r"<t[rd]\b", text, re.I):
        parser = _TableRows()
        parser.feed(text)
        parser.close()
        rows = [" ".join(cell for cell in row if cell) for row in parser.rows]
        rows = [row for row in rows if row.strip()]
        if rows:
            return rows
    plain = html.unescape(re.sub(r"<br\s*/?>", "\n", text, flags=re.I))
    plain = re.sub(r"<[^>]+>", " ", plain)
    rows = []
    for line in plain.splitlines():
        # Other blocks are Markdown: drop heading marks, bullets and emphasis, keep every character of the text.
        line = re.sub(r"^\s*(?:#{1,6}\s+|[-*+]\s+)", "", line)
        line = re.sub(r"(\*\*|__)(.+?)\1", r"\2", line)
        line = " ".join(line.split())
        if line:
            rows.append(line)
    return rows


def _box(value: Any, width: int, height: int) -> list[int] | None:
    """Boxes are on a 0-1000 grid relative to the page, whatever size of image the model saw."""
    try:
        left, top, right, bottom = (float(v) for v in value)
    except (TypeError, ValueError):
        return None
    left, right = sorted((left * width / 1000, right * width / 1000))
    top, bottom = sorted((top * height / 1000, bottom * height / 1000))
    box = [max(0, round(left)), max(0, round(top)), min(width, round(right)), min(height, round(bottom))]
    return box if box[2] > box[0] and box[3] > box[1] else None


def blocks_to_lines(blocks: list[dict[str, Any]], page_size: tuple[int, int]) -> list[dict[str, Any]]:
    """Turn page blocks into the service's line records, in page coordinates."""
    lines: list[dict[str, Any]] = []
    for block in blocks:
        category = str(block.get("category") or "").strip()
        if category.lower() in SKIPPED_CATEGORIES:
            continue
        rows = text_rows(str(block.get("text") or ""))
        if not rows:
            continue
        box = _box(block.get("bbox"), *page_size)
        step = (box[3] - box[1]) / len(rows) if box else 0
        for index, row in enumerate(rows):
            # Rows share the block's box evenly; good enough to pair a label with the amount beside it.
            row_box = [box[0], round(box[1] + index * step), box[2], round(box[1] + (index + 1) * step)] if box else None
            lines.append({
                "text": row,
                "confidence": None,
                "box": row_box,
                "polygon": None,
                "low_confidence": False,
                "needs_review": False,
                "engine": "typhoon",
                "category": category,
            })
    return lines


def number_tokens(text: str) -> set[str]:
    """Numbers word by word: comparable_text drops spaces, so a whole line would merge "x6 54.00" into "654.00"."""
    tokens = set()
    for word in text.split():
        for token in NUMBER.findall(comparable_text(word)):
            token = token.strip(".,/-")
            digits = sum(c.isdigit() for c in token)
            if digits >= 3 or re.fullmatch(r"\d+\.\d{2}", token):
                tokens.add(token)
    return tokens


def _confirmed(token: str, readings: list[str]) -> bool:
    pattern = re.compile(rf"(?<![\d]){re.escape(token)}(?![\d])")
    return any(pattern.search(reading) for reading in readings)


def _overlap(box: list[int] | None, other: list[int] | None) -> float:
    if not box or not other:
        return 0.0
    height = min(box[3], other[3]) - max(box[1], other[1])
    smaller = min(box[3] - box[1], other[3] - other[1])
    return height / smaller if smaller > 0 and height > 0 else 0.0


def check_numbers(lines: list[dict[str, Any]], paddle_lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Flag every Typhoon line whose numbers PaddleOCR did not also read, and add amounts only PaddleOCR saw."""
    paddle_readings = [comparable_text(str(line.get("text") or "")) for line in paddle_lines]
    joined = "".join(paddle_readings)
    paddle_tokens: set[str] = set()
    for paddle in paddle_lines:
        paddle_tokens |= number_tokens(str(paddle.get("text") or ""))
    seen: set[str] = set()
    for line in lines:
        tokens = number_tokens(line["text"])
        seen |= tokens
        if not tokens:
            continue
        line["crosscheck_engine"] = "paddle"
        # Word-level tokens first; the joined readings catch a number PaddleOCR split across two boxes.
        missing = [
            token
            for token in tokens
            if token not in paddle_tokens
            and not _confirmed(token, paddle_readings)
            and not _confirmed(token, [joined])
        ]
        if not missing:
            line["crosscheck_status"] = "agree"
            continue
        line["crosscheck_status"] = "disagree"
        line["needs_review"] = True
        line["review_reason"] = "number_not_confirmed"
        nearby = max(paddle_lines, key=lambda other: _overlap(line.get("box"), other.get("box")), default=None)
        if nearby is not None and _overlap(line.get("box"), nearby.get("box")) >= 0.4:
            line["crosscheck_candidate"] = str(nearby.get("text") or "")
            line["crosscheck_confidence"] = nearby.get("confidence")
    for paddle in paddle_lines:
        amounts = {
            token for token in number_tokens(str(paddle.get("text") or ""))
            if re.fullmatch(r"\d+\.\d{2}", token) or re.fullmatch(r"\d{13}", token)
        }
        if amounts and not amounts & seen and (paddle.get("confidence") or 0) >= 0.5:
            # Typhoon skipped an amount or ID that PaddleOCR read clearly: keep it, for the person to check.
            lines.append({
                **{key: paddle.get(key) for key in ("text", "confidence", "box", "polygon")},
                "low_confidence": bool(paddle.get("low_confidence")),
                "needs_review": True,
                "engine": "paddle",
                "crosscheck_status": "missing_in_typhoon",
                "review_reason": "only_paddle_read_this",
            })
            seen |= amounts
    return lines


class TyphoonThaiOCR(LocalThaiOCR):
    """PaddleOCR prepares and reads each page (orientation, skew, contrast), then Typhoon reads the prepared page."""

    def __init__(self, files: dict[str, Path] | None = None) -> None:
        super().__init__()
        self._files = files if files is not None else typhoon_files()
        self._server: LlamaServer | None = None
        self._server_failed = False
        self._prepared: Image.Image | None = None
        self._deadline = 0.0
        self._typhoon_pages = 0

    def process(self, path: Path, config: OCRConfig) -> dict[str, Any]:
        self._deadline = time.monotonic() + REQUEST_BUDGET_SECONDS
        self._typhoon_pages = 0
        try:
            result = super().process(path, config)
        finally:
            if self._server:
                self._server.stop()
                self._server = None
        if self._typhoon_pages:
            result["engine"] = ENGINE_NAME
        result["summary"]["typhoon_pages"] = self._typhoon_pages
        return result

    def _enrich_lines(self, image, lines, config, warnings) -> None:
        # The last image enriched for a page is the one its coordinates refer to.
        self._prepared = image
        super()._enrich_lines(image, lines, config, warnings)

    def _ocr_image(self, image, page_number, config, warnings, original_size=None, detail=False):
        # Optional second readers check PaddleOCR's own lines; with Typhoon reading, PaddleOCR is the checker.
        paddle_config = replace(config, crosscheck=False, tesseract_crosscheck=False, handwriting_fallback=False)
        self._prepared = None
        page = super()._ocr_image(image, page_number, paddle_config, warnings, original_size=original_size, detail=detail)
        prepared = self._prepared or image
        try:
            lines = self._read_typhoon(prepared, (page["width"], page["height"]))
        except TyphoonError as exc:
            self._add_warning(warnings, f"{exc} PaddleOCR's reading is shown instead.")
            return page
        page["paddle_lines"] = len(page["lines"])
        page["lines"] = check_numbers(lines, page["lines"])
        page["engine"] = "typhoon"
        self._typhoon_pages += 1
        return page

    def _read_typhoon(self, image: Image.Image, page_size: tuple[int, int]) -> list[dict[str, Any]]:
        if not self._files:
            raise TyphoonError("Typhoon OCR is not installed.")
        if self._server_failed:
            raise TyphoonError("Typhoon OCR could not start.")
        remaining = self._deadline - time.monotonic()
        if remaining < 30:
            raise TyphoonError("Typhoon OCR ran out of time for this file.")
        if self._server is None:
            server = LlamaServer(self._files)
            try:
                server.start()
            except (TyphoonError, OSError) as exc:
                self._server_failed = True
                raise TyphoonError("Typhoon OCR could not start.") from exc
            self._server = server
        sent = prepare_image(image)
        reply = self._server.chat(request_payload(sent), self._deadline - time.monotonic())
        try:
            choice = reply["choices"][0]
            content = choice["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise TyphoonError("Typhoon OCR returned an empty answer.") from exc
        # A cut-off answer is where a small model starts inventing text; do not use it.
        if choice.get("finish_reason") == "length":
            raise TyphoonError("Typhoon OCR's answer was cut off.")
        lines = blocks_to_lines(parse_blocks(str(content or "")), page_size)
        if not lines:
            raise TyphoonError("Typhoon OCR found no text on this page.")
        return lines
