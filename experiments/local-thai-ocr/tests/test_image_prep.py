import unittest
from unittest.mock import patch

from PIL import Image, ImageDraw

import ocr_engine


def line(text, box, confidence=0.9):
    return {"text": text, "box": box, "confidence": confidence, "needs_review": False}


class ImagePrepTests(unittest.TestCase):
    def test_phone_photo_is_turned_by_its_exif_orientation(self):
        import tempfile
        from pathlib import Path

        sideways = Image.new("RGB", (300, 100), "white")
        exif = Image.Exif()
        exif[0x0112] = 6  # stored rotated; viewers turn it 90 degrees clockwise
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "receipt.jpg"
            sideways.save(path, exif=exif)
            reader = ocr_engine.LocalThaiOCR()
            seen = []
            with patch.object(reader, "_predict_lines", side_effect=lambda image, *_: seen.append(image.size) or []):
                result = reader.process(path, ocr_engine.OCRConfig())

        self.assertEqual(seen, [(100, 300)])
        self.assertEqual(result["pages"][0]["original_width"], 100)
        self.assertFalse(any("resized" in warning for warning in result["warnings"]))

    def test_faded_print_is_darkened_and_clear_print_is_left_alone(self):
        faded = Image.new("RGB", (200, 100), (235, 235, 235))
        ImageDraw.Draw(faded).rectangle((20, 40, 180, 60), fill=(170, 170, 170))
        warnings = []
        darker = ocr_engine.LocalThaiOCR._stretch_contrast(faded, warnings)
        self.assertLess(darker.getpixel((100, 50))[0], 60)
        self.assertTrue(warnings)

        clear = Image.new("RGB", (200, 100), "white")
        ImageDraw.Draw(clear).rectangle((20, 40, 30, 45), fill="black")
        warnings = []
        self.assertIs(ocr_engine.LocalThaiOCR._stretch_contrast(clear, warnings), clear)
        self.assertEqual(warnings, [])

    def test_sideways_page_is_read_upright(self):
        image = Image.new("RGB", (100, 300), "white")
        reader = ocr_engine.LocalThaiOCR()

        def predict(page, *_):
            if page.size == (100, 300):  # as scanned: text runs top to bottom
                return [line("x?z", [10, 10 + 60 * i, 30, 60 + 60 * i], 0.3) for i in range(4)]
            return [line("ยอดสุทธิ 107.00", [10, 10 + 20 * i, 200, 30 + 20 * i], 0.95) for i in range(4)]

        warnings = []
        with patch.object(reader, "_predict_lines", side_effect=predict):
            page = reader._ocr_image(image, 1, ocr_engine.OCRConfig(), warnings)

        self.assertEqual((page["width"], page["height"]), (300, 100))
        self.assertEqual(page["lines"][0]["text"], "ยอดสุทธิ 107.00")
        self.assertIn("The page was turned upright before OCR.", warnings)

    def test_upright_page_with_short_numbers_is_read_once(self):
        image = Image.new("RGB", (300, 300), "white")
        reader = ocr_engine.LocalThaiOCR()
        lines = [line("1", [10, 10, 15, 40]), line("2", [10, 50, 15, 80]), line("2", [10, 90, 15, 120]),
                 line("ยอดรวม 85.00", [40, 10, 250, 40])]
        with patch.object(reader, "_predict_lines", return_value=lines) as predict:
            reader._ocr_image(image, 1, ocr_engine.OCRConfig(), [])
        self.assertEqual(predict.call_count, 1)


if __name__ == "__main__":
    unittest.main()
