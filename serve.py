#!/usr/bin/env python3
"""Máy chủ nhỏ cho Bé Học Vui: phục vụ app trong mạng nhà và lưu hồ sơ của bé vào data/profiles.json,
để tivi, máy tính bảng và máy tính dùng chung tiến độ.

    python3 serve.py            # rồi mở http://<IP máy Mac>:8080 trên tivi
"""

import json
import os
import re
import socket
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "profiles.json"
PORT = int(os.environ.get("PORT", "8080"))
PROFILE_PATH = re.compile(r"^/api/profiles/([A-Za-z0-9_-]{1,40})$")
MAX_BODY = 256 * 1024
lock = threading.Lock()


def load():
    try:
        return json.loads(DATA.read_text("utf-8"))
    except (OSError, ValueError):
        return {}


def save(profiles):
    DATA.parent.mkdir(exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=DATA.parent, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(profiles, f, ensure_ascii=False, indent=1)
    os.replace(tmp, DATA)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # Sửa code xong thì tivi lấy bản mới ngay.
        self.send_header("Cache-Control", "no-cache")
        # App cài trên tivi chạy từ file:// nên cần CORS để đồng bộ hồ sơ.
        if self.path.startswith("/api/"):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Private-Network", "true")
        super().end_headers()

    def do_OPTIONS(self):
        if not self.path.startswith("/api/"):
            return self.send_error(404)
        self.send_response(204)
        self.end_headers()

    def send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/profiles":
            with lock:
                return self.send_json(200, {"profiles": list(load().values())})
        if path.startswith(("/data/", "/tools/")) or path.endswith(".py"):
            return self.send_error(404)
        super().do_GET()

    def do_PUT(self):
        m = PROFILE_PATH.match(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        if not m or not 0 < length <= MAX_BODY:
            return self.send_error(400)
        try:
            profile = json.loads(self.rfile.read(length))
        except ValueError:
            return self.send_error(400)
        if not isinstance(profile, dict) or profile.get("id") != m.group(1):
            return self.send_error(400)
        with lock:
            profiles = load()
            old = profiles.get(m.group(1))
            # Bản cũ hơn bản đang lưu (vd. từ thiết bị khác) thì bỏ qua.
            if old and old.get("updatedAt", 0) > profile.get("updatedAt", 0):
                return self.send_json(409, old)
            profiles[m.group(1)] = profile
            save(profiles)
        self.send_json(200, {"ok": True})


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("192.168.1.1", 9))  # UDP: không gửi gói nào, chỉ để biết IP trong mạng nhà
        return s.getsockname()[0]
    except OSError:
        return "localhost"
    finally:
        s.close()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Bé Học Vui: http://{lan_ip()}:{PORT}  (Ctrl+C để dừng)", flush=True)
    server.serve_forever()
