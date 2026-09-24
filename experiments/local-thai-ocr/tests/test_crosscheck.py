import unittest
from unittest.mock import patch

from PIL import Image

from crosscheck import comparable_text
from ocr_engine import LocalThaiOCR, OCRConfig


class FakePaddle:
    def predict(self, _image):
        return [{
            "rec_texts": ["วันที่ 24/09/2569"],
            "rec_scores": [0.99],
            "rec_boxes": [[10, 10, 220, 45]],
        }]


class FakeCrosscheck:
    def __init__(self, text, confidence):
        self.text = text
        self.confidence = confidence

    def read_lines(self, _image, boxes):
        assert boxes == [[2, 5, 228, 50]]
        return [{"text": self.text, "confidence": self.confidence}]


class CrosscheckTests(unittest.TestCase):
    def setUp(self):
        self.reader = LocalThaiOCR()
        self.image = Image.new("RGB", (300, 80), "white")

    def test_comparison_preserves_thai_marks_and_normalizes_digits(self):
        self.assertEqual(comparable_text("วันที่ ๒๔/๐๙/๒๕๖๙"), comparable_text("วันที่24-09-2569"))
        self.assertNotEqual(comparable_text("วันที"), comparable_text("วันที่"))

    def test_high_confidence_disagreement_flags_line_without_replacing_text(self):
        warnings = []
        with (
            patch.object(self.reader, "_get_ocr", return_value=FakePaddle()),
            patch.object(self.reader, "_get_crosscheck", return_value=FakeCrosscheck("วันที่ 25/09/2569", 0.9)),
        ):
            lines = self.reader._predict_lines(self.image, OCRConfig(crosscheck=True), warnings)

        self.assertEqual(lines[0]["text"], "วันที่ 24/09/2569")
        self.assertEqual(lines[0]["crosscheck_candidate"], "วันที่ 25/09/2569")
        self.assertEqual(lines[0]["crosscheck_status"], "disagree")
        self.assertTrue(lines[0]["needs_review"])
        self.assertFalse(lines[0]["low_confidence"])

    def test_weak_second_reading_is_not_treated_as_disagreement(self):
        with (
            patch.object(self.reader, "_get_ocr", return_value=FakePaddle()),
            patch.object(self.reader, "_get_crosscheck", return_value=FakeCrosscheck("gibberish", 0.01)),
        ):
            lines = self.reader._predict_lines(self.image, OCRConfig(crosscheck=True), [])

        self.assertEqual(lines[0]["crosscheck_status"], "uncertain")
        self.assertFalse(lines[0]["needs_review"])

    def test_missing_optional_model_keeps_primary_ocr_result(self):
        warnings = []
        with (
            patch.object(self.reader, "_get_ocr", return_value=FakePaddle()),
            patch.object(self.reader, "_get_crosscheck", side_effect=ImportError("missing")),
        ):
            lines = self.reader._predict_lines(self.image, OCRConfig(crosscheck=True), warnings)

        self.assertEqual(lines[0]["text"], "วันที่ 24/09/2569")
        self.assertNotIn("crosscheck_status", lines[0])
        self.assertTrue(any("not installed" in warning for warning in warnings))

    def test_crosscheck_has_a_document_level_work_limit(self):
        image = Image.new("RGB", (300, 80), "white")
        warnings = []
        batches = []

        def read_lines(_image, boxes):
            batches.append(len(boxes))
            return [{"text": "same", "confidence": 0.9} for _ in boxes]

        line_batches = [
            [{"text": "same", "box": [10, 10, 100, 40], "low_confidence": False, "needs_review": False} for _ in range(80)]
            for _ in range(3)
        ]
        with patch.object(self.reader, "_get_crosscheck") as get_crosscheck:
            get_crosscheck.return_value.read_lines.side_effect = read_lines
            for lines in line_batches:
                self.reader._crosscheck_lines(image, lines, warnings)

        self.assertEqual(batches, [80, 20])
        self.assertEqual(sum("crosscheck_status" in line for batch in line_batches for line in batch), 100)
        self.assertTrue(any("per-document line limit" in warning for warning in warnings))


if __name__ == "__main__":
    unittest.main()
