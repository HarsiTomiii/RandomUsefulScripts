"""Serve the calibration tool on the local network so a TV browser can open it.

    python serve.py            # port 8000
    python serve.py 8080

Then open the printed http://<pc-ip>:<port> address on the TV. Stop with Ctrl+C.
Firewall: on CachyOS with ufw enabled, allow the port from your LAN only, e.g.
    sudo ufw allow from 192.168.0.0/16 to any port 8000 proto tcp
On Windows, allow Python for Private networks only when asked.
"""
import functools
import http.server
import socket
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def lan_addresses():
    addrs = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            addrs.add(info[4][0])
    except OSError:
        pass
    # Route lookup only (UDP connect sends no packets); finds the address of the default interface.
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            addrs.add(s.getsockname()[0])
    except OSError:
        pass
    return sorted(a for a in addrs if not a.startswith("127."))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # keep the console readable


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = functools.partial(Handler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("0.0.0.0", port), handler) as httpd:
        print("Serving", ROOT)
        for a in lan_addresses() or ["<this-pc-ip>"]:
            print(f"  open on the TV:  http://{a}:{port}")
        print(f"  on this PC:      http://localhost:{port}")
        print("Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
