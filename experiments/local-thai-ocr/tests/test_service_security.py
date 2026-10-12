import http.client
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import patch

import app


class ServiceSecurityTests(unittest.TestCase):
    def setUp(self):
        self.worker = patch.object(app, "run_ocr_worker", return_value={"text": "synthetic text", "pages": []})
        self.mock_worker = self.worker.start()
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.worker.stop()

    def request(self, headers=None, method="POST", path="/api/ocr?filename=synthetic.png", timeout=2):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=timeout)
        try:
            connection.request(method, path, body=b"synthetic bytes" if method == "POST" else None, headers=headers or {})
            response = connection.getresponse()
            status = response.status
            response.read()
            return status
        finally:
            connection.close()

    def test_foreign_host_cannot_rebind_to_loopback(self):
        self.assertEqual(self.request({"Host": "attacker.example"}), 403)
        self.assertEqual(self.request({"Host": "attacker.example"}, method="GET", path="/"), 403)
        self.mock_worker.assert_not_called()

    def test_cross_site_and_null_origins_cannot_start_ocr(self):
        for origin in ["https://attacker.example", "null", "http://127.0.0.1:1"]:
            self.assertEqual(self.request({"Origin": origin}), 403)
        self.mock_worker.assert_not_called()

    def test_desktop_and_same_origin_trial_requests_still_work(self):
        self.assertEqual(self.request(), 200)  # The Desktop main process sends no Origin.
        origin = f"http://127.0.0.1:{self.server.server_port}"
        self.assertEqual(self.request({"Origin": origin}), 200)
        self.assertEqual(self.request({"Host": f"localhost:{self.server.server_port}", "Origin": f"http://localhost:{self.server.server_port}"}), 200)
        self.assertEqual(self.mock_worker.call_count, 3)

    def test_busy_service_rejects_before_reading_or_queueing_another_document(self):
        app._process_lock.acquire()
        try:
            # Announce a document but send only the headers: the service must answer without waiting for the body.
            # (Unsent body bytes also keep Windows from resetting the socket when the service closes it unread.)
            connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=0.5)
            try:
                connection.putrequest("POST", "/api/ocr?filename=synthetic.png")
                connection.putheader("Content-Length", "15")
                connection.endheaders()
                response = connection.getresponse()
                self.assertEqual(response.status, 503)
                response.read()
            finally:
                connection.close()
        finally:
            app._process_lock.release()

    def test_logs_exclude_document_names_and_handle_unparsed_requests(self):
        with patch("builtins.print") as output:
            self.assertEqual(self.request(path="/api/ocr?filename=synthetic-private-name.png"), 200)
            app.Handler.__new__(app.Handler).log_message("bad request")
        self.assertNotIn("synthetic-private-name", str(output.call_args_list))


if __name__ == "__main__":
    unittest.main()
