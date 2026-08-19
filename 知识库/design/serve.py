#!/usr/bin/env python3
"""PROTOTYPE static server. Throwaway. Bind all interfaces so WSL → Windows works."""

from __future__ import annotations

import http.server
import os
import socket
import socketserver

DIR = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("SOIT_PROTO_PORT", "8765"))


def lan_ips() -> list[str]:
    ips: list[str] = []
    try:
        out = os.popen("hostname -I").read().strip().split()
        ips = [x for x in out if "." in x and not x.startswith("172.17.")]
    except OSError:
        pass
    if not ips:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("1.1.1.1", 80))
            ips = [s.getsockname()[0]]
            s.close()
        except OSError:
            ips = []
    return ips


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))


if __name__ == "__main__":
    os.chdir(DIR)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
        file = "prototype-workspace.html"
        print("PROTOTYPE  →  知识库/design")
        print(f"Windows    →  http://127.0.0.1:{PORT}/{file}?variant=A")
        for ip in lan_ips():
            print(f"WSL IP     →  http://{ip}:{PORT}/{file}?variant=A")
        print("keys       →  A Workbench · B Stack · C Paper")
        print("stop       →  Ctrl+C")
        httpd.serve_forever()
