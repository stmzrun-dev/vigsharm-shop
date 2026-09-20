# -*- coding: utf-8 -*-
"""Reliable local static server for VigSharm on http://127.0.0.1:5500"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import mimetypes
import urllib.parse
import sys

ROOT = Path(__file__).resolve().parents[1]
PORT = 5500

mimetypes.add_type("text/css", ".css")
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/svg+xml", ".svg")


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    # Avoid tiny makefile buffering quirks on Windows
    wbufsize = -1

    def do_GET(self):
        try:
            self._serve()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        except Exception as e:
            print("ERROR", repr(e), flush=True)

    def do_HEAD(self):
        self.do_GET()

    def _resolve(self):
        parsed = urllib.parse.urlparse(self.path)
        rel = urllib.parse.unquote(parsed.path.lstrip("/")) or "index.html"
        if rel in ("product", "catalog", "price", "delivery", "index"):
            cand = ROOT / (rel + ".html")
            if cand.is_file():
                return cand
        path = (ROOT / rel).resolve()
        try:
            path.relative_to(ROOT.resolve())
        except ValueError:
            return None
        if path.is_dir():
            index = path / "index.html"
            return index if index.is_file() else None
        return path if path.is_file() else None

    def _serve(self):
        path = self._resolve()
        if path is None:
            self.send_error(404, "File not found")
            return

        data = path.read_bytes()
        ctype = mimetypes.guess_type(str(path))[0] or "application/octet-stream"

        header = (
            f"HTTP/1.1 200 OK\r\n"
            f"Content-Type: {ctype}\r\n"
            f"Content-Length: {len(data)}\r\n"
            f"Cache-Control: no-store, max-age=0\r\n"
            f"Connection: close\r\n"
            f"\r\n"
        ).encode("ascii", "ignore")

        # Bypass wfile makefile — send raw bytes on the socket
        sock = self.connection
        if self.command == "HEAD":
            sock.sendall(header)
        else:
            sock.sendall(header + data)

        self.close_connection = True
        # Prevent BaseHTTPRequestHandler from touching wfile further
        self._headers_buffer = []

    def handle_one_request(self):
        try:
            super().handle_one_request()
        finally:
            pass

    def log_message(self, fmt, *args):
        sys.stdout.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))
        sys.stdout.flush()


def main():
    ThreadingHTTPServer.allow_reuse_address = True
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("READY http://127.0.0.1:%s" % PORT, flush=True)
    print("ROOT  %s" % ROOT, flush=True)
    try:
        httpd.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        print("\nStopped", flush=True)
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
