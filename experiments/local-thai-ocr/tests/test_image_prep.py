import unittest
import math
from unittest.mock import patch

from PIL import Image

import ocr_engine


def line(text, box, confidence=0.9):
    return {"text": text, "box": box, "confidence": confidence, "needs_review": False}


class ImagePrepTests(unittest.TestCase):
    def test_upside_down_horizontal_text_and_empty_sideways_readings_recover(self):
        for initial in ([], [line("ส?า?", [10, 10, 200, 35], 0.35)]):
            image = Image.new("RGB", (300, 100), "white")
            image.putpixel((0, 0), (0, 0, 0))
            reader = ocr_engine.LocalThaiOCR()

            def predict(page, *_):
                if page.size == (300, 100) and page.getpixel((299, 99)) == (0, 0, 0):
                    return [line("วันที่ ๒๐/๑๐/๒๕๖๙", [10, 10, 250, 40], .98)]
                return initial

            with patch.object(reader, "_predict_lines", side_effect=predict):
                page = reader._ocr_image(image, 1, ocr_engine.OCRConfig(), [])
            self.assertEqual(page["lines"][0]["text"], "วันที่ ๒๐/๑๐/๒๕๖๙")
            self.assertIn("rotate-180", page["preprocessing"])
            self.assertEqual(image.getpixel((0, 0)), (0, 0, 0))

    def test_long_uncertain_rotation_cannot_replace_clearer_source(self):
        original = [line("ยอด 107.00", [10, 10, 200, 35], .72)]
        reader = ocr_engine.LocalThaiOCR()
        with patch.object(reader, "_predict_lines", side_effect=[original] + [
            [line("ข้อความที่อ่านผิด" * 8, [10, 10, 200, 35], .4)] for _ in range(3)
        ]):
            page = reader._ocr_image(Image.new("RGB", (300, 100), "white"), 1, ocr_engine.OCRConfig(), [])
        self.assertEqual(page["lines"][0]["text"], "ยอด 107.00")
        self.assertEqual(page["preprocessing"], [])

    def test_faded_source_is_kept_when_contrast_retry_reads_worse(self):
        image = Image.new("RGB", (300, 100), (240, 240, 240))
        for x in range(50, 200):
            for y in range(30, 50):
                image.putpixel((x, y), (200, 200, 200))
        reader = ocr_engine.LocalThaiOCR()
        with patch.object(reader, "_predict_lines", side_effect=[
            [line("วันที่ 20/10/2569", [20, 20, 250, 60], .98)],
            [line("วันที 20/10/2569", [20, 20, 250, 60], .8)],
        ]):
            page = reader._ocr_image(image, 1, ocr_engine.OCRConfig(), [])
        self.assertEqual(page["lines"][0]["text"], "วันที่ 20/10/2569")
        self.assertEqual(page["preprocessing"], [])

    def test_trials_do_not_consume_optional_reader_budget(self):
        reader = ocr_engine.LocalThaiOCR()
        image = Image.new("RGB", (300, 100), "white")
        weak = [line("???", [10, 10, 250, 40], .3)]
        clear = [line("ยอดสุทธิ 107.00", [10, 10, 250, 40], .98)]
        seen_configs = []

        def read(_image, config, *_):
            seen_configs.append(config)
            return clear if len(seen_configs) == 2 else weak

        with patch.object(reader, "_read_page", side_effect=read), \
                patch.object(reader, "_crosscheck_lines") as crosscheck:
            page = reader._ocr_image(image, 1, ocr_engine.OCRConfig(crosscheck=True), [])
        self.assertTrue(all(not config.crosscheck for config in seen_configs))
        crosscheck.assert_called_once()
        self.assertIs(crosscheck.call_args.args[1], page["lines"])
        self.assertEqual(page["lines"][0]["text"], "ยอดสุทธิ 107.00")

    def test_deskew_requires_several_agreeing_long_text_baselines(self):
        def tilted(angle, y):
            offset = 200 * math.tan(math.radians(angle))
            return {"text": "วันที่และยอดเงิน", "polygon": [[10, y], [210, y + offset],
                    [210, y + offset + 20], [10, y + 20]]}
        estimate = ocr_engine.LocalThaiOCR._deskew_angle
        self.assertAlmostEqual(estimate([tilted(3, y) for y in (20, 60, 100, 140)]), 3)
        self.assertAlmostEqual(estimate([tilted(-3, y) for y in (20, 60, 100)]), -3)
        self.assertIsNone(estimate([tilted(3, 20)]))
        self.assertIsNone(estimate([tilted(angle, y) for angle, y in zip((3, -3, 7), (20, 60, 100))]))
        self.assertIsNone(estimate([tilted(20, y) for y in (20, 60, 100)]))

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
