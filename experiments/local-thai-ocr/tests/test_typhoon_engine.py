import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from PIL import Image

import ocr_engine
import typhoon_engine
import typhoon_setup

# Synthetic receipt content only.
TABLE = "<table><tr><td>กาแฟเย็น</td><td>2</td><td>130.00</td></tr><tr><th>รวมทั้งสิ้น</th><td></td><td>1,070.00</td></tr></table>"


def paddle_line(text, box, confidence=0.95):
    return {"text": text, "confidence": confidence, "box": box, "polygon": None,
            "low_confidence": False, "needs_review": False}


class ReplyParsingTests(unittest.TestCase):
    def test_fenced_json_list_is_read(self):
        # The shape of a real benchmark reply: a blank line, then a fenced list.
        reply = '\n```json\n[{"bbox": [1, 2, 3, 4], "category": "title", "text": "ร้านทดสอบ"}]\n```'
        self.assertEqual(typhoon_engine.parse_blocks(reply)[0]["text"], "ร้านทดสอบ")
        self.assertEqual(typhoon_engine.parse_blocks('{"elements": [{"bbox": [1, 2, 3, 4], "text": "ก"}]}')[0]["text"], "ก")

    def test_cut_off_list_is_refused(self):
        with self.assertRaises(typhoon_engine.TyphoonError):
            typhoon_engine.parse_blocks('[{"bbox": [1, 2, 3, 4], "text": "รวม 100.00"}, {"bbox": [1, 2')

    def test_unreadable_answer_is_an_engine_error_not_text(self):
        with self.assertRaises(typhoon_engine.TyphoonError):
            typhoon_engine.parse_blocks("ขออภัย ไม่สามารถอ่านได้")

    def test_table_rows_keep_label_and_amount_on_one_line(self):
        self.assertEqual(typhoon_engine.text_rows(TABLE), ["กาแฟเย็น 2 130.00", "รวมทั้งสิ้น 1,070.00"])
        self.assertEqual(typhoon_engine.text_rows("เลขที่ A-001<br>วันที่ 01/02/2569"), ["เลขที่ A-001", "วันที่ 01/02/2569"])
        self.assertEqual(typhoon_engine.text_rows("# **ร้านทดสอบ**\n- ยอด -107.00"), ["ร้านทดสอบ", "ยอด -107.00"])

    def test_blocks_become_page_lines_scaled_to_the_page(self):
        blocks = [
            {"bbox": [100, 50, 900, 150], "category": "table", "text": TABLE},
            {"bbox": [0, 0, 10, 10], "category": "figure", "text": "โลโก้ร้าน"},
        ]
        lines = typhoon_engine.blocks_to_lines(blocks, (500, 1000))
        self.assertEqual([line["text"] for line in lines], ["กาแฟเย็น 2 130.00", "รวมทั้งสิ้น 1,070.00"])
        self.assertEqual(lines[0]["box"], [50, 50, 450, 100])
        self.assertEqual(lines[1]["box"], [50, 100, 450, 150])
        self.assertTrue(all(line["engine"] == "typhoon" and line["confidence"] is None for line in lines))

    def test_small_pages_are_scaled_up_and_huge_pages_down(self):
        self.assertEqual(max(typhoon_engine.prepare_image(Image.new("RGB", (400, 800))).size), typhoon_engine.MIN_LONG_SIDE)
        big = typhoon_engine.prepare_image(Image.new("RGB", (6000, 3000)))
        self.assertLessEqual(max(big.size), typhoon_engine.MAX_LONG_SIDE)

    def test_request_uses_official_decoding(self):
        payload = typhoon_engine.request_payload(Image.new("RGB", (20, 20), "white"))
        self.assertEqual((payload["temperature"], payload["top_p"]), (0.0, 1.0))
        content = payload["messages"][0]["content"]
        # Image first, then the prompt, as the official client sends it.
        self.assertEqual([part["type"] for part in content], ["image_url", "text"])
        self.assertTrue(content[0]["image_url"]["url"].startswith("data:image/png;base64,"))
        self.assertIn("format text as HTML", content[1]["text"])


class NumberCheckTests(unittest.TestCase):
    def test_numbers_paddle_also_read_are_confirmed(self):
        lines = typhoon_engine.blocks_to_lines([{"bbox": [0, 0, 1000, 200], "category": "text", "text": "รวมทั้งสิ้น 1,070.00"}],
                                               (100, 100))
        checked = typhoon_engine.check_numbers(lines, [paddle_line("รวมทั้งสิน 1070.00", [0, 0, 100, 20])])
        self.assertEqual(checked[0]["crosscheck_status"], "agree")
        self.assertFalse(checked[0]["needs_review"])

    def test_a_number_paddle_did_not_read_is_flagged_with_paddles_text(self):
        lines = typhoon_engine.blocks_to_lines([{"bbox": [0, 0, 1000, 200], "category": "text", "text": "รวมทั้งสิ้น 1,670.00"}],
                                               (100, 100))
        checked = typhoon_engine.check_numbers(lines, [paddle_line("รวมทั้งสิน 1,070.00", [0, 2, 100, 22])])
        self.assertEqual(checked[0]["crosscheck_status"], "disagree")
        self.assertTrue(checked[0]["needs_review"])
        self.assertEqual(checked[0]["crosscheck_candidate"], "รวมทั้งสิน 1,070.00")
        self.assertEqual(checked[0]["crosscheck_engine"], "paddle")

    def test_a_longer_number_does_not_confirm_a_shorter_one(self):
        lines = [{"text": "ยอด 100", "box": None, "needs_review": False}]
        checked = typhoon_engine.check_numbers(lines, [paddle_line("ยอด 1000", None)])
        self.assertEqual(checked[0]["crosscheck_status"], "disagree")

    def test_an_amount_only_paddle_read_is_kept_for_review(self):
        lines = [{"text": "ร้านทดสอบ", "box": [0, 0, 50, 10], "needs_review": False}]
        checked = typhoon_engine.check_numbers(lines, [paddle_line("ภาษีมูลค่าเพิ่ม 70.00", [0, 40, 80, 50])])
        self.assertEqual(len(checked), 2)
        self.assertEqual(checked[1]["engine"], "paddle")
        self.assertTrue(checked[1]["needs_review"])
        self.assertEqual(checked[1]["crosscheck_status"], "missing_in_typhoon")

    def test_neighbouring_numbers_stay_separate(self):
        # From the 2026-11-20 run on the synthetic benchmark: merged tokens added false review lines.
        self.assertEqual(typhoon_engine.number_tokens("น้ำดื่มตราสายธาร 600 มล. x6 54.00"), {"600", "54.00"})
        self.assertEqual(typhoon_engine.number_tokens("1 ถ่ายเอกสารขาวดำ A4 1,200 0.50 600.00"), {"1200", "0.50", "600.00"})
        self.assertEqual(typhoon_engine.number_tokens("ภาษีมูลค่าเพิ่ม 7% 6,017.90"), {"6017.90"})
        lines = [{"text": "1 ถ่ายเอกสารขาวดำ A4 1,200 0.50 600.00", "box": None, "needs_review": False},
                 {"text": "น้ำดื่มตราสายธาร 600 มล. x6 54.00", "box": None, "needs_review": False}]
        paddle = [paddle_line("1", None), paddle_line("ถ่ายเอกสารขาวดำ A4", None), paddle_line("1,200", None),
                  paddle_line("0.50", None), paddle_line("600.00", None),
                  paddle_line("น้ำดื่มตราสายธาร 600 มล. x6", None), paddle_line("54.00", None)]
        checked = typhoon_engine.check_numbers(lines, paddle)
        self.assertEqual([line["crosscheck_status"] for line in checked], ["agree", "agree"])
        self.assertEqual(len(checked), 2, "no Paddle amount is added when Typhoon read it")

    def test_short_quantities_and_text_lines_are_not_flagged(self):
        lines = [{"text": "กาแฟ 2 แก้ว", "box": None, "needs_review": False}, {"text": "ขอบคุณ", "box": None, "needs_review": False}]
        checked = typhoon_engine.check_numbers(lines, [])
        self.assertFalse(any(line["needs_review"] for line in checked))


class EngineTests(unittest.TestCase):
    def reader(self, reply=None, error=None):
        reader = typhoon_engine.TyphoonThaiOCR(files={"server": Path("s"), "model": Path("m"), "mmproj": Path("p")})
        paddle = [paddle_line("รวมทั้งสิน 1,070.00", [10, 10, 190, 30])]
        model = SimpleNamespace(predict=lambda image: [{"rec_texts": [paddle[0]["text"]], "rec_scores": [0.95],
                                                        "rec_boxes": [paddle[0]["box"]], "rec_polys": []}])
        server = SimpleNamespace(start=lambda: None, stop=lambda: None,
                                 chat=lambda payload, timeout: (_ for _ in ()).throw(error) if error else reply)
        return reader, model, server

    def run_reader(self, reader, model, server):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic.png"
            Image.new("RGB", (200, 100), "white").save(path)
            with patch.object(reader, "_get_ocr", return_value=model), \
                    patch.object(typhoon_engine, "LlamaServer", return_value=server):
                return reader.process(path, ocr_engine.OCRConfig())

    def test_typhoon_lines_replace_paddle_lines_and_are_checked(self):
        content = json.dumps([{"bbox": [50, 100, 950, 300], "category": "text", "text": "รวมทั้งสิ้น 1,070.00"}], ensure_ascii=False)
        reply = {"choices": [{"message": {"content": content}, "finish_reason": "stop"}]}
        result = self.run_reader(*self.reader(reply))
        line = result["pages"][0]["lines"][0]
        self.assertEqual(result["engine"], typhoon_engine.ENGINE_NAME)
        self.assertEqual(line["text"], "รวมทั้งสิ้น 1,070.00")
        self.assertEqual(line["crosscheck_status"], "agree")
        self.assertEqual(result["summary"]["typhoon_pages"], 1)
        self.assertEqual(result["text"], "รวมทั้งสิ้น 1,070.00")

    def test_cut_off_answer_falls_back_to_paddle_with_a_warning(self):
        reply = {"choices": [{"message": {"content": "[{\"text\": \"รวม 9"}, "finish_reason": "length"}]}
        result = self.run_reader(*self.reader(reply))
        self.assertEqual(result["engine"], "PaddleOCR PP-OCRv5 Thai Mobile")
        self.assertEqual(result["pages"][0]["lines"][0]["text"], "รวมทั้งสิน 1,070.00")
        self.assertTrue(any("cut off" in warning for warning in result["warnings"]))

    def test_server_failure_falls_back_to_paddle(self):
        result = self.run_reader(*self.reader(error=typhoon_engine.TyphoonError("Typhoon OCR did not answer.")))
        self.assertEqual(result["summary"]["typhoon_pages"], 0)
        self.assertTrue(any("PaddleOCR's reading" in warning for warning in result["warnings"]))

    def test_server_command_stays_on_loopback_with_a_key(self):
        server = typhoon_engine.LlamaServer({"server": Path("llama-server"), "model": Path("m.gguf"), "mmproj": Path("p.gguf")})
        server.port, server.key = 1234, "k"
        command = server.command()
        self.assertEqual(command[command.index("--host") + 1], "127.0.0.1")
        self.assertEqual(command[command.index("--api-key") + 1], "k")
        self.assertNotIn("-t", command)
        with patch.object(typhoon_engine, "THREADS", "8"):
            command = server.command()
        self.assertEqual(command[command.index("-t") + 1], "8")


class ServiceEngineChoiceTests(unittest.TestCase):
    def post(self, path):
        import http.client
        import threading
        from http.server import ThreadingHTTPServer

        import app

        server = ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with patch.object(app, "run_ocr_worker", return_value={"text": "", "pages": []}) as worker:
                connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=5)
                connection.request("POST", path, body=b"synthetic bytes")
                connection.getresponse().read()
                connection.close()
            return worker.call_args.args[-1]
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)

    def test_typhoon_is_used_when_installed_unless_paddle_is_asked_for(self):
        with patch("typhoon_setup.typhoon_installed", return_value=True):
            self.assertEqual(self.post("/api/ocr?filename=s.png"), "typhoon")
            self.assertEqual(self.post("/api/ocr?filename=s.png&engine=paddle"), "paddle")
        with patch("typhoon_setup.typhoon_installed", return_value=False):
            self.assertEqual(self.post("/api/ocr?filename=s.png&engine=typhoon"), "paddle")


class InstallLayoutTests(unittest.TestCase):
    def test_files_are_found_only_when_all_are_present(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            name = "llama-server.exe" if os.name == "nt" else "llama-server"
            (root / "llama" / "build" / "bin").mkdir(parents=True)
            (root / "models").mkdir()
            self.assertIsNone(typhoon_setup.typhoon_files(root))
            (root / "llama" / "build" / "bin" / name).write_bytes(b"")
            (root / "models" / typhoon_setup.MODEL_FILE).write_bytes(b"")
            self.assertIsNone(typhoon_setup.typhoon_files(root))
            (root / "models" / typhoon_setup.MMPROJ_FILE).write_bytes(b"")
            self.assertEqual(typhoon_setup.typhoon_files(root)["server"].name, name)
            with patch.dict(os.environ, {"STEP_TYPHOON_DIR": directory}):
                self.assertTrue(typhoon_setup.typhoon_installed())
        with patch.dict(os.environ, {"STEP_TYPHOON_DIR": ""}):
            self.assertFalse(typhoon_setup.typhoon_installed())


if __name__ == "__main__":
    unittest.main()
