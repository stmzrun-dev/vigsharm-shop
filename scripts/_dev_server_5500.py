# -*- coding: utf-8 -*-
"""Reliable local static server for VigSharm on http://127.0.0.1:5500

Prefer:  powershell -File scripts/start_dev_5500.ps1
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import gzip
import mimetypes
import re
import socket
import time
import urllib.parse
import sys

ROOT = Path(__file__).resolve().parents[1]
PORT = 5500
CACHE_BUST = str(int(time.time()))

mimetypes.add_type("text/css", ".css")
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/svg+xml", ".svg")

_TEXT_EXT = {".html", ".htm", ".css", ".js", ".mjs", ".json", ".svg"}
_CACHE_LONG = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".css", ".js", ".mjs"}
_CONN_ERR = (
    BrokenPipeError,
    ConnectionResetError,
    ConnectionAbortedError,
    TimeoutError,
    ConnectionError,
)

_ASSET_ATTR_RE = re.compile(
    r"""(?P<attr>\b(?:href|src)\s*=\s*["'])"""
    r"""(?P<url>(?!https?:|//|data:|mailto:|tel:)[^"']+\.(?:css|js|mjs))"""
    r"""(?:\?[^"']*)?"""
    r"""(?P<q>["'])""",
    re.IGNORECASE,
)


def _content_type(path: Path) -> str:
    ctype = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    if path.suffix.lower() in _TEXT_EXT and "charset=" not in ctype:
        ctype = ctype + "; charset=utf-8"
    return ctype


def _bust_html(data: bytes, token: str) -> bytes:
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return data

    def repl(match: re.Match) -> str:
        return "%s%s?v=%s%s" % (
            match.group("attr"),
            match.group("url"),
            token,
            match.group("q"),
        )

    return _ASSET_ATTR_RE.sub(repl, text).encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    timeout = 30
    wbufsize = -1

    def handle(self):
        try:
            super().handle()
        except _CONN_ERR:
            pass
        except OSError as e:
            if getattr(e, "winerror", None) in (10054, 10053, 10038):
                return
            raise

    def finish(self):
        try:
            super().finish()
        except Exception:
            pass

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except _CONN_ERR:
            self.close_connection = True
        except OSError:
            self.close_connection = True

    def do_GET(self):
        try:
            self._serve()
        except _CONN_ERR:
            self.close_connection = True
        except OSError as e:
            self.close_connection = True
            if getattr(e, "winerror", None) not in (10054, 10053, 10038):
                print("ERROR", repr(e), flush=True)
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

    def _wants_gzip(self) -> bool:
        enc = self.headers.get("Accept-Encoding", "")
        return "gzip" in enc.lower()

    def _serve(self):
        path = self._resolve()
        if path is None:
            self.send_error(404, "File not found")
            return

        ext = path.suffix.lower()
        is_html = ext in (".html", ".htm")
        data = path.read_bytes()
        if is_html:
            data = _bust_html(data, CACHE_BUST)

        use_gzip = self._wants_gzip() and ext in _TEXT_EXT and len(data) > 512
        if use_gzip:
            data = gzip.compress(data, compresslevel=4)

        ctype = _content_type(path)
        if ext in _CACHE_LONG and not is_html:
            cache = "public, max-age=86400"
        else:
            cache = "no-store, max-age=0"

        self.send_response(200, "OK")
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", cache)
        if use_gzip:
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Vary", "Accept-Encoding")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        if self.command != "HEAD":
            self.wfile.write(data)

    def log_message(self, fmt, *args):
        # Skip noisy asset lines — Windows console I/O was stalling the server.
        path = self.path.split("?", 1)[0]
        if path.endswith((
            ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico",
            ".woff", ".woff2", ".css", ".js",
        )):
            return
        sys.stdout.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))
        sys.stdout.flush()


class DevServer(ThreadingHTTPServer):
    allow_reuse_address = False
    daemon_threads = True
    request_queue_size = 128
    block_on_close = False

    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        except OSError:
            pass
        super().server_bind()

    def handle_error(self, request, client_address):
        err = sys.exc_info()[1]
        if isinstance(err, _CONN_ERR):
            return
        if isinstance(err, OSError) and getattr(err, "winerror", None) in (10054, 10053, 10038):
            return
        print("ERROR client=%s %r" % (client_address, err), flush=True)


def main():
    try:
        httpd = DevServer(("127.0.0.1", PORT), Handler)
    except OSError as e:
        print(
            "FAIL  port %s already in use (or bind error: %s)\n"
            "      Stop the other process, then:  powershell -File scripts/start_dev_5500.ps1"
            % (PORT, e),
            flush=True,
        )
        sys.exit(1)

    print("READY http://127.0.0.1:%s" % PORT, flush=True)
    print("ROOT  %s" % ROOT, flush=True)
    print("BUST  css/js ?v=%s" % CACHE_BUST, flush=True)
    print("MODE  keep-alive + gzip + image cache (quiet log)", flush=True)
    try:
        httpd.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        print("\nStopped", flush=True)
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
