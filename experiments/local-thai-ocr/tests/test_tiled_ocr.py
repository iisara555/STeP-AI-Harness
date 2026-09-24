import unittest
from unittest.mock import patch

from PIL import Image

import ocr_engine


class TiledOCRTests(unittest.TestCase):
    def test_overlap_keeps_one_line_with_page_coordinates(self):
        image = Image.new("RGB", (200, 100), "white")
        image.putpixel((0, 0), (0, 0, 0))
        image.putpixel((80, 0), (80, 0, 0))
        reader = ocr_engine.LocalThaiOCR()

        def predict(tile, _config, _warnings):
            origin_x = tile.getpixel((0, 0))[0]
            return [{
                "text": "seam line",
                "box": [95 - origin_x, 30, 115 - origin_x, 50],
                "confidence": 0.9,
                "needs_review": False,
            }]

        with (
            patch.object(ocr_engine, "OCR_TILE_SIDE", 100),
            patch.object(ocr_engine, "OCR_TILE_OVERLAP", 20),
            patch.object(reader, "_predict_lines", side_effect=predict),
        ):
            lines = reader._ocr_tiled(image, ocr_engine.OCRConfig(), [])

        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0]["box"], [95, 30, 115, 50])


if __name__ == "__main__":
    unittest.main()
