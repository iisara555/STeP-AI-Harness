import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

import app


class WorkerIsolationTests(unittest.TestCase):
    def test_worker_failure_keeps_server_available_and_removes_upload(self):
        with tempfile.TemporaryDirectory() as directory:
            worker = Path(directory) / "fail_worker.py"
            worker.write_text("raise SystemExit(23)\n", encoding="utf-8")
            existing_uploads = set(Path(tempfile.gettempdir()).glob("step-local-ocr-*"))
            server = ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base = f"http://127.0.0.1:{server.server_port}"
            try:
                with patch.object(app, "WORKER", worker):
                    request = urllib.request.Request(
                        base + "/api/ocr?filename=sample.png",
                        data=b"synthetic test data",
                        method="POST",
                    )
                    with self.assertRaises(urllib.error.HTTPError) as raised:
                        urllib.request.urlopen(request, timeout=10)
                    self.assertEqual(raised.exception.code, 500)
                    body = json.loads(raised.exception.read())
                    self.assertEqual(body["error"], "ocr_failed")
                    self.assertIn("exit code 23", body["message"])

                with urllib.request.urlopen(base + "/api/health", timeout=10) as response:
                    self.assertTrue(json.loads(response.read())["ok"])
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=5)

            self.assertEqual(
                set(Path(tempfile.gettempdir()).glob("step-local-ocr-*")),
                existing_uploads,
            )


if __name__ == "__main__":
    unittest.main()
