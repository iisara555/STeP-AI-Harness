import math
import subprocess
import sys
from types import SimpleNamespace
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

import ocr_engine
from crosscheck import comparable_text


class OCRQualityTests(unittest.TestCase):
    def test_detected_polygons_are_retained_for_skew_aware_mapping(self):
        polygon = [[10, 12], [100, 10], [100, 30], [10, 32]]
        model = SimpleNamespace(predict=lambda image: [{'rec_texts': ['ยอดสุทธิ 107.00'],
            'rec_scores': [.95], 'rec_boxes': [[10, 10, 100, 32]], 'rec_polys': [polygon]}])
        reader = ocr_engine.LocalThaiOCR()
        with patch.object(reader, '_get_ocr', return_value=model):
            lines = reader._predict_lines(Image.new('RGB', (120, 50)), ocr_engine.OCRConfig(), [])
        self.assertEqual(lines[0]['polygon'], polygon)

    def test_only_low_contrast_images_are_normalized_without_changing_source_pixels(self):
        faded = Image.new('RGB', (100, 100), (240, 240, 240))
        for x in range(10, 30):
            for y in range(10, 30):
                faded.putpixel((x, y), (200, 200, 200))
        warnings = []
        prepared = ocr_engine.LocalThaiOCR._normalize_low_contrast(faded, warnings)
        self.assertLess(prepared.getpixel((15, 15))[0], 30)
        self.assertGreater(prepared.getpixel((50, 50))[0], 240)
        self.assertEqual(faded.getpixel((15, 15)), (200, 200, 200))
        self.assertTrue(warnings)
        # Stretch without clipping the darkest/lightest half-percent of ink:
        # otherwise thin Thai marks can change shape into a confident wrong glyph.
        rare_ink = faded.copy()
        rare_ink.putpixel((0, 0), (190, 190, 190))
        rare_ink.putpixel((99, 99), (250, 250, 250))
        stretched = ocr_engine.LocalThaiOCR._normalize_low_contrast(rare_ink, [])
        self.assertGreater(stretched.getpixel((15, 15))[0], 30)
        self.assertLess(stretched.getpixel((50, 50))[0], 230)
        normal = Image.new('RGB', (100, 100), 'white')
        for x in range(10, 30):
            for y in range(10, 30):
                normal.putpixel((x, y), (0, 0, 0))
        self.assertIs(ocr_engine.LocalThaiOCR._normalize_low_contrast(normal, []), normal)
        blank = Image.new('RGB', (100, 100), 'white')
        self.assertIs(ocr_engine.LocalThaiOCR._normalize_low_contrast(blank, []), blank)

    def test_native_pdf_path_does_not_import_heavy_models(self):
        result = subprocess.run([sys.executable, '-c', "import sys,ocr_engine; assert 'paddleocr' not in sys.modules"],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_model_threads_respect_two_core_employee_machine(self):
        constructor = unittest.mock.MagicMock()
        with patch.dict(sys.modules, {'paddleocr': SimpleNamespace(PaddleOCR=constructor)}), \
                patch.object(ocr_engine, 'PaddleOCR', constructor, create=True), \
                patch.object(ocr_engine.os, 'cpu_count', return_value=2):
            ocr_engine.LocalThaiOCR()._get_ocr()
        self.assertEqual(constructor.call_args.kwargs['cpu_threads'], 2)

    def test_numeric_punctuation_cannot_hide_amount_or_reference_changes(self):
        for left, right in [('ยอด 1.07', 'ยอด 107'), ('เลขที่ AB-001', 'เลขที่ AB001'),
                            ('ยอด -107', 'ยอด 107'), ('ยอด 1,07', 'ยอด 107')]:
            self.assertNotEqual(comparable_text(left), comparable_text(right))
        self.assertEqual(comparable_text('ยอด ๑,๐๗๐.๐๐'), comparable_text('ยอด 1070.00'))
        self.assertEqual(comparable_text('วันที่ ๒๔/๐๙/๒๕๖๙'), comparable_text('วันที่24-09-2569'))

    def test_exif_phone_rotation_is_applied_before_ocr(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'synthetic.jpg'
            image = Image.new('RGB', (80, 40), 'white')
            exif = image.getexif()
            exif[274] = 6
            image.save(path, exif=exif)
            reader = ocr_engine.LocalThaiOCR()
            sizes = []
            def recognize(image, page, config, warnings, **kwargs):
                sizes.append((image.size, kwargs['original_size']))
                return {'page': page, 'source': 'ocr', 'lines': []}
            with patch.object(reader, '_ocr_image', side_effect=recognize):
                result = reader.process(path, ocr_engine.OCRConfig())
            self.assertEqual(sizes, [((40, 80), (40, 80))])
            self.assertTrue(any('EXIF' in warning for warning in result['warnings']))

    def test_unknown_or_invalid_confidence_is_always_reviewed(self):
        for value in [math.nan, math.inf, -0.1, 1.1, 'invalid']:
            self.assertIsNone(ocr_engine.LocalThaiOCR._to_float(value))
        self.assertEqual(ocr_engine.LocalThaiOCR._to_float(0.95), 0.95)

    def test_tile_keeps_overlap_detection_when_owning_tile_misses_it(self):
        image = Image.new('RGB', (200, 100), 'white')
        image.putpixel((0, 0), (0, 0, 0))
        image.putpixel((80, 0), (80, 0, 0))
        reader = ocr_engine.LocalThaiOCR()
        def predict(tile, _config, _warnings):
            if tile.getpixel((0, 0))[0] == 80:
                return []
            return [{'text': 'ยอด 107.00', 'box': [95, 30, 115, 50],
                     'confidence': .9, 'needs_review': False}]
        warnings = []
        with patch.object(ocr_engine, 'OCR_TILE_SIDE', 100), patch.object(ocr_engine, 'OCR_TILE_OVERLAP', 20), \
                patch.object(reader, '_predict_lines', side_effect=predict):
            lines = reader._ocr_tiled(image, ocr_engine.OCRConfig(), warnings)
        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0]['box'], [95, 30, 115, 50])
        self.assertTrue(lines[0]['needs_review'])
        self.assertEqual(lines[0]['tile_overlap_recovery'], True)

    def test_tile_conflicts_preserve_alternative_without_replacing_primary(self):
        image = Image.new('RGB', (200, 100), 'white')
        image.putpixel((0, 0), (0, 0, 0))
        image.putpixel((80, 0), (80, 0, 0))
        reader = ocr_engine.LocalThaiOCR()
        def predict(tile, _config, _warnings):
            origin = tile.getpixel((0, 0))[0]
            return [{'text': 'ยอด 1.07' if origin == 0 else 'ยอด 107',
                     'box': [95-origin, 30, 115-origin, 50], 'confidence': .9, 'needs_review': False}]
        with patch.object(ocr_engine, 'OCR_TILE_SIDE', 100), patch.object(ocr_engine, 'OCR_TILE_OVERLAP', 20), \
                patch.object(reader, '_predict_lines', side_effect=predict):
            lines = reader._ocr_tiled(image, ocr_engine.OCRConfig(), [])
        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0]['text'], 'ยอด 107')
        self.assertTrue(lines[0]['needs_review'])
        self.assertEqual(lines[0]['tile_candidates'][0]['text'], 'ยอด 1.07')


if __name__ == '__main__':
    unittest.main()
