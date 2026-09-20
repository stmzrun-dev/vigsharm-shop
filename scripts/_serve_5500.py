import socket
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class FastThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True

    def get_request(self):
        conn, addr = super().get_request()
        # Disable Nagle's algorithm: without this, combined with Windows'
        # delayed ACK, large static files (images) trickle in extremely
        # slowly or stall entirely on localhost.
        conn.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        return conn, addr


FastThreadingHTTPServer(("127.0.0.1", 5500), SimpleHTTPRequestHandler).serve_forever()
