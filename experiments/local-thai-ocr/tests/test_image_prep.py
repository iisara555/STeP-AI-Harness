import unittest
from unittest.mock import patch

from PIL import Image

import ocr_engine


def line(text, box, confidence=0.9):
    return {"text": text, "box": box, "confidence": confidence, "needs_review": False}


class ImagePrepTests(unittest.TestCase):
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
