"""分鏡設計台的啟動器：啟動 serve.py，並在 serve.py 被修改時自動重啟。

- 重啟前先檢查語法；有錯就繼續跑舊版，等下次修改再試。
- 有生成在排隊或進行中就等它跑完，不會中斷生成。
- serve.py 意外結束時自動重新啟動（短時間內連續崩潰就停下來等修改）。

用法：python run.py [--port 8790]（start.bat 會用這個；埠號預設讀 .env 的 STUDIO_PORT）
關掉這個視窗就會連同伺服器一起停止。
"""
from __future__ import annotations

import argparse
import json
import os
import py_compile
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from envfile import load_env

load_env()
ROOT = Path(__file__).resolve().parent
SERVE = ROOT / "serve.py"


def log(msg: str) -> None:
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def busy(port: int) -> bool:
    """有生成在排隊或進行中？查不到（伺服器沒回應）就當作沒有"""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/queue", timeout=3) as r:
            return any(j["state"] in ("queued", "running") for j in json.load(r))
    except Exception:  # noqa: BLE001
        return False


def syntax_ok() -> bool:
    try:
        py_compile.compile(str(SERVE), doraise=True)
        return True
    except py_compile.PyCompileError as e:
        log(f"serve.py 有語法錯誤，繼續使用舊版：\n{e.msg}")
        return False


def start(port: int) -> subprocess.Popen:
    log(f"啟動伺服器 http://127.0.0.1:{port}/")
    env = {**os.environ, "STUDIO_PARENT_PID": str(os.getpid())}  # serve.py 會在 run.py 結束時跟著結束
    return subprocess.Popen([sys.executable, "-u", str(SERVE), "--port", str(port)], cwd=str(ROOT), env=env)


def stop(proc: subprocess.Popen) -> None:
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("STUDIO_PORT") or 8790))
    port = ap.parse_args().port

    proc = start(port)
    mtime = SERVE.stat().st_mtime
    crashes: list[float] = []
    pending = False  # 檔案改了、等生成跑完才重啟
    try:
        while True:
            time.sleep(2)
            now = SERVE.stat().st_mtime
            if now != mtime:
                mtime = now
                if syntax_ok():
                    pending = True
                    log("偵測到 serve.py 修改，準備重啟")
            if pending:
                if busy(port):
                    continue  # 等生成跑完
                pending = False
                stop(proc)
                proc = start(port)
                crashes.clear()
                continue
            if proc.poll() is not None:
                crashes = [t for t in crashes if time.time() - t < 60] + [time.time()]
                if len(crashes) >= 3:
                    log("伺服器一分鐘內連續結束 3 次，暫停自動重啟；修改 serve.py 後會再試")
                    while SERVE.stat().st_mtime == mtime:
                        time.sleep(2)
                    continue
                log(f"伺服器意外結束（代碼 {proc.returncode}），重新啟動")
                proc = start(port)
    except KeyboardInterrupt:
        pass
    finally:
        if proc.poll() is None:
            stop(proc)


if __name__ == "__main__":
    main()
