# /// script
# requires-python = ">=3.12"
# dependencies = ["aiowebostv==0.10.0"]
# ///
"""Điều khiển tivi LG webOS qua mạng LAN.

    uv run lgtv.py               # ghép đôi (lần đầu) + in thông tin tivi
    uv run lgtv.py launcher      # các app trên thanh launcher, đúng thứ tự
    uv run lgtv.py apps          # tất cả app, kể cả app ẩn
    uv run lgtv.py launch <id>   # mở một app, vd: youtube.leanback.v4
    uv run lgtv.py open <url>    # mở một trang web bằng trình duyệt của tivi

Tivi được dò tự động trong mạng (IP có thể đổi sau mỗi lần bật); chỉ định cố định bằng LGTV_HOST.
"""

import asyncio
import json
import os
import socket
import sys
import time
from pathlib import Path

import aiowebostv.webos_client as webos_client
from aiowebostv import WebOsClient

KEY_FILE = Path(__file__).with_name(".lgtv_key.json")


def discover(timeout: float = 3.0) -> str | None:
    """Tìm tivi LG webOS trong mạng bằng SSDP."""
    msg = ("M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\n"
           "ST: urn:lge-com:service:webos-second-screen:1\r\n\r\n").encode()
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    s.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
    s.settimeout(0.5)
    try:
        for _ in range(2):
            s.sendto(msg, ("239.255.255.250", 1900))
        end = time.time() + timeout
        while time.time() < end:
            try:
                return s.recvfrom(4096)[1][0]
            except socket.timeout:
                continue
    finally:
        s.close()
    return None


HOST = os.environ.get("LGTV_HOST") or discover() or "192.168.1.105"

# Mặc định chỉ chờ 10 giây, không kịp cầm remote bấm "Đồng ý".
webos_client.RECEIVE_TIMEOUT = 60


def load_key() -> str | None:
    try:
        keys = json.loads(KEY_FILE.read_text())
    except (OSError, ValueError):
        return None
    # Khóa gắn với tivi chứ không với IP: tivi đổi IP thì dùng lại khóa cũ.
    return keys.get(HOST) or next(iter(keys.values()), None)


def save_key(key: str) -> None:
    try:
        keys = json.loads(KEY_FILE.read_text())
    except (OSError, ValueError):
        keys = {}
    keys[HOST] = key
    KEY_FILE.write_text(json.dumps(keys, indent=2))
    KEY_FILE.chmod(0o600)


async def main(args: list[str]) -> None:
    key = load_key()
    client = WebOsClient(HOST, key)
    if not key:
        print(f"Đang ghép đôi với {HOST}: hãy bấm 'Đồng ý' trên tivi (60 giây)...")
    await client.connect()
    if client.client_key != key:
        save_key(client.client_key)
        print("Ghép đôi thành công, đã lưu khóa vào", KEY_FILE.name)

    try:
        cmd = args[0] if args else "info"
        if cmd == "info":
            # Thông tin phần mềm (getSoftwareInfo) bị tivi từ chối: 401 insufficient permissions.
            print("Model:      ", client.tv_info.system.get("modelName"))
            print("App đang mở:", client.tv_state.current_app_id)
        elif cmd == "launcher":
            res = await client.request("com.webos.applicationManager/listLaunchPoints")
            for i, lp in enumerate(res.get("launchPoints", []), 1):
                flags = " (hệ thống)" if lp.get("systemApp") else ""
                print(f"{i:3}. {lp.get('title')!s:35} {lp.get('id')}{flags}")
        elif cmd == "apps":
            for app in sorted(await client.get_apps_all(), key=lambda a: a.get("title", "")):
                hidden = "" if app.get("visible", True) else " [ẩn]"
                print(f"{app.get('title')!s:35} {app.get('id')}{hidden}")
        elif cmd == "launch" and len(args) > 1:
            await client.launch_app(args[1])
            print("Đã mở", args[1])
        elif cmd == "open" and len(args) > 1:
            await client.request("system.launcher/open", {"target": args[1]})
            print("Đã mở", args[1])
        else:
            print(__doc__)
    finally:
        await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
