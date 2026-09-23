#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import tempfile
import threading
import urllib.parse
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from ocr_engine import OCRConfig, LocalThaiOCR

ROOT = Path(__file__).resolve().parent
WEB_ROOT = ROOT / "web"
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}

_engine: LocalThaiOCR | None = None
_engine_lock = threading.Lock()


def get_engine() -> LocalThaiOCR:
    global _engine
    with _engine_lock:
        if _engine is None:
            _engine = LocalThaiOCR()
        return _engine


class Handler(BaseHTTPRequestHandler):
    server_version = "STePLocalThaiOCR/0.1"

    def log_message(self, fmt: str, *args) -> None:
        print(f"[local-ocr] {self.address_string()} - {fmt % args}")

    def _send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path: Path) -> None:
        if not path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        data = path.read_bytes()
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", f"{ctype}; charset=utf-8" if ctype.startswith("text/") else ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in {"/", "/index.html"}:
            return self._send_file(WEB_ROOT / "index.html")
        if parsed.path == "/api/health":
            return self._send_json({
                "ok": True,
                "service": "STeP Local Thai OCR",
                "version": "0.1",
                "local_only": True,
            })
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/api/ocr":
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        length_header = self.headers.get("Content-Length")
        if not length_header:
            return self._send_json({"ok": False, "error": "missing_content_length"}, 411)

        try:
            length = int(length_header)
        except ValueError:
            return self._send_json({"ok": False, "error": "invalid_content_length"}, 400)

        if length <= 0 or length > MAX_UPLOAD_BYTES:
            return self._send_json({
                "ok": False,
                "error": "file_too_large",
                "max_mb": MAX_UPLOAD_BYTES // (1024 * 1024),
            }, 413)

        query = urllib.parse.parse_qs(parsed.query)
        original_name = Path(query.get("filename", ["upload"])[0]).name
        suffix = Path(original_name).suffix.lower()
        if suffix not in ALLOWED_EXTENSIONS:
            return self._send_json({
                "ok": False,
                "error": "unsupported_file",
                "allowed": sorted(ALLOWED_EXTENSIONS),
            }, 415)

        try:
            threshold = float(query.get("threshold", ["0.80"])[0])
        except ValueError:
            threshold = 0.80
        threshold = min(0.99, max(0.10, threshold))
        handwriting = query.get("handwriting", ["off"])[0] in {"1", "true", "on", "fallback"}

        raw = self.rfile.read(length)
        with tempfile.TemporaryDirectory(prefix="step-local-ocr-") as tmp:
            input_path = Path(tmp) / f"input{suffix}"
            input_path.write_bytes(raw)
            try:
                result = get_engine().process(
                    input_path,
                    OCRConfig(
                        low_confidence_threshold=threshold,
                        handwriting_fallback=handwriting,
                    ),
                )
                result["filename"] = original_name
                return self._send_json({"ok": True, "result": result})
            except Exception as exc:
                return self._send_json({
                    "ok": False,
                    "error": "ocr_failed",
                    "message": str(exc),
                }, 500)


def main() -> None:
    parser = argparse.ArgumentParser(description="STeP standalone local Thai OCR trial")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host; keep 127.0.0.1 for local-only use.")
    parser.add_argument("--port", default=8765, type=int)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    if args.host not in {"127.0.0.1", "localhost"} and os.environ.get("STEP_OCR_ALLOW_REMOTE") != "1":
        raise SystemExit(
            "Remote binding is disabled by default. Use 127.0.0.1, "
            "or set STEP_OCR_ALLOW_REMOTE=1 only for an intentionally isolated test network."
        )

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    url = f"http://127.0.0.1:{args.port}/"
    print(f"STeP Local Thai OCR: {url}")
    print("Documents are processed on this computer. Press Ctrl+C to stop.")

    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
