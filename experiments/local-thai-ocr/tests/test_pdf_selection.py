import tempfile
import unittest
import zlib
from pathlib import Path
from unittest.mock import patch

from ocr_engine import OCRConfig, LocalThaiOCR


def make_pdf(text: str, *, full_page_image: bool = False) -> bytes:
    escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    content = f"BT /F1 10 Tf 72 720 Td ({escaped}) Tj ET".encode("ascii")
    resources = "/Font << /F1 4 0 R >>"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    if full_page_image:
        pixels = zlib.compress(b"\xff\xff\xff")
        objects.append(
            b"<< /Type /XObject /Subtype /Image /Width 1 /Height 1 "
            b"/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode "
            + f"/Length {len(pixels)} >>\nstream\n".encode()
            + pixels
            + b"\nendstream"
        )
        resources += " /XObject << /Im1 5 0 R >>"
        content = b"q 612 0 0 792 0 0 cm /Im1 Do Q\n" + content

    content_id = len(objects) + 1
    objects[2] = (
        f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        f"/Resources << {resources} >> /Contents {content_id} 0 R >>"
    ).encode()
    objects.append(f"<< /Length {len(content)} >>\nstream\n".encode() + content + b"\nendstream")

    output = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, value in enumerate(objects, 1):
        offsets.append(len(output))
        output += f"{index} 0 obj\n".encode() + value + b"\nendobj\n"
    xref = len(output)
    output += f"xref\n0 {len(offsets)}\n".encode() + b"0000000000 65535 f \n"
    for offset in offsets[1:]:
        output += f"{offset:010d} 00000 n \n".encode()
    output += f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(output)


class NativePdfSelectionTests(unittest.TestCase):
    def test_short_native_page_without_large_image_skips_ocr(self):
        text = "Short native text"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "short.pdf"
            path.write_bytes(make_pdf(text))
            engine = LocalThaiOCR()
            with patch.object(engine, "_ocr_image", side_effect=AssertionError("OCR was called")):
                result = engine.process(path, OCRConfig(render_dpi=72))

        self.assertEqual(result["pages"][0]["source"], "native_pdf_text")
        self.assertEqual(result["text"], text)

    def test_short_text_on_scanned_page_uses_ocr(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "scanned.pdf"
            path.write_bytes(make_pdf("Page 1", full_page_image=True))
            engine = LocalThaiOCR()
            ocr_page = {"page": 1, "source": "ocr", "lines": []}
            with patch.object(engine, "_ocr_image", return_value=ocr_page) as ocr:
                result = engine.process(path, OCRConfig(render_dpi=72))

        ocr.assert_called_once()
        self.assertEqual(result["pages"][0]["source"], "ocr")

    def test_long_native_text_on_scanned_page_skips_ocr(self):
        text = "This native text layer is long enough to be used without OCR."
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "native.pdf"
            path.write_bytes(make_pdf(text, full_page_image=True))
            engine = LocalThaiOCR()
            with patch.object(engine, "_ocr_image", side_effect=AssertionError("OCR was called")):
                result = engine.process(path, OCRConfig(render_dpi=72))

        self.assertEqual(result["pages"][0]["source"], "native_pdf_text")
        self.assertEqual(result["text"], text)


if __name__ == "__main__":
    unittest.main()
