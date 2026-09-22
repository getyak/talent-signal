#!/usr/bin/env python3
"""Serve only synthetic update artifacts on loopback; never serve the private key."""
import argparse
import http.server
import pathlib

parser = argparse.ArgumentParser()
parser.add_argument("updates", type=pathlib.Path)
args = parser.parse_args()

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ("/appcast.xml", "/Talent-Signal-Rehearsal.zip"):
            self.send_error(404)
            return
        payload = (args.updates / self.path[1:]).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "application/xml" if self.path.endswith("xml") else "application/zip")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

http.server.ThreadingHTTPServer(("127.0.0.1", 4398), Handler).serve_forever()
