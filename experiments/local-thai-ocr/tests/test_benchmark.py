import json
import importlib.util
import tempfile
import unittest
from pathlib import Path

from benchmark.generate import generate
from benchmark.score import score_fields, canonical
from benchmark.safety import external_path


class BenchmarkTests(unittest.TestCase):
    def test_metrics_distinguish_missed_errors_false_alerts_and_invented_values(self):
        truth = {'total': '107.00', 'date': '23/09/2569', 'taxId': '', 'receiptNumber': '0001'}
        result = score_fields(truth, {'total': '108', 'date': '23/09/2569', 'taxId': '111', 'receiptNumber': '1'}, {'total', 'date'})
        self.assertEqual(result['review'], {'tp': 1, 'fp': 1, 'fn': 2, 'tn': 0, 'precision': 0.5, 'recall': 1 / 3})
        self.assertEqual(result['fields']['taxId']['error'], 'invented')
        self.assertEqual(result['fields']['receiptNumber']['critical_error'], True)
        self.assertEqual(result['fields']['total']['canonical_exact'], False)

    def test_normalization_does_not_hide_critical_changes(self):
        self.assertEqual(canonical('total', '๑,๐๗๐.๐๐'), canonical('total', '1070'))
        self.assertNotEqual(canonical('receiptNumber', '0001'), canonical('receiptNumber', '1'))
        self.assertNotEqual(canonical('date', '01/02/2569'), canonical('date', '02/01/2569'))
        self.assertNotEqual(canonical('merchant', 'ร้านตัวอย่าง'), canonical('merchant', 'ร้านตัวอย่าง สาขาสอง'))
        self.assertNotEqual(canonical('total', '1O7'), canonical('total', '107'))

    def test_real_data_paths_reject_checkout_and_symlink_escape(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / 'repo'
            root.mkdir()
            outside = Path(d) / 'private'
            outside.mkdir()
            (outside / 'link').symlink_to(root, target_is_directory=True)
            self.assertEqual(external_path(outside, root), outside.resolve())
            for path in [root, root / 'ignored', outside / 'link' / 'output']:
                with self.assertRaises(ValueError):
                    external_path(path, root)

    def test_generation_is_deterministic_paired_and_covers_h_to_o(self):
        font = Path('/usr/share/fonts/truetype/noto/NotoSerifThai-Regular.ttf')
        if not font.is_file() or not importlib.util.find_spec('PIL'):
            self.skipTest('provide NotoSerifThai-Regular.ttf for the image-generation test')
        with tempfile.TemporaryDirectory() as d:
            a, b = Path(d) / 'a', Path(d) / 'b'
            generate(a, font, count=1, seed=42)
            generate(b, font, count=1, seed=42)
            cases = [json.loads(p.read_text()) for p in sorted(a.glob('*.truth.json'))]
            self.assertEqual([c['scenario'] for c in cases], list('HIJKLMNO'))
            for case in cases:
                name = case['id'] + '.png'
                self.assertEqual((a / name).read_bytes(), (b / name).read_bytes())
                self.assertEqual((a / (case['id'] + '.truth.json')).read_bytes(), (b / (case['id'] + '.truth.json')).read_bytes())
                self.assertTrue(case['synthetic'])
                self.assertTrue(case['regions'])
            self.assertEqual(cases[4]['fields']['taxId'], '')
            self.assertTrue(cases[-1]['simulated_handwriting'])


if __name__ == '__main__':
    unittest.main()
