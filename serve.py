"""分鏡設計台 — 本機後端（只綁 127.0.0.1）

用法：python serve.py [--port 8790]（平常用 start.bat／run.py 啟動）
然後用瀏覽器開 http://127.0.0.1:8790/
設定讀同資料夾的 .env（見 .env.example）：STUDIO_PORT、STUDIO_PROJECTS_DIR、CODEX_IMAGE_GEN

資料：
  projects/<專案>/project.json   角色、場景、分鏡（前端整份存回）
  projects/<專案>/gens.json      生成版本（只由後端寫入；核可／現行版透過 API 改）
  projects/<專案>/characters/    上傳或匯入的角色卡（複製，不動原檔）
  projects/<專案>/scenes/        上傳或匯入的場景圖
  projects/<專案>/frames/        生成的首幀 S01_v1.png …，logs/ 是每次生成的完整輸出
"""
from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import queue
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from envfile import env_path, load_env

load_env()
ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
PROJECTS = env_path("STUDIO_PROJECTS_DIR", ROOT / "projects")
GEN_PY = env_path("CODEX_IMAGE_GEN", ROOT / "tools" / "codex_image_gen.py")
IMG_EXT = {".png", ".jpg", ".jpeg", ".webp"}
KINDS = ("characters", "scenes", "refs")  # 可以上傳／匯入的資料夾
MIME = {".js": "application/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json",
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".log": "text/plain"}

lock = threading.RLock()
jobs: "queue.Queue[dict]" = queue.Queue()
job_list: list[dict] = []  # 全部工作（含已完成），給前端看佇列


def safe_name(name: str) -> str:
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", name).strip(" .")
    return name or "untitled"


def project_dir(p: str) -> Path:
    d = (PROJECTS / safe_name(p)).resolve()
    if PROJECTS.resolve() not in d.parents:
        raise ValueError("bad project")
    return d


def read_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def inside(base: Path, rel: str) -> Path | None:
    """rel 解析後必須在 base 資料夾內，否則回傳 None（擋路徑穿越與絕對路徑）"""
    base = base.resolve()
    p = (base / rel).resolve()
    return p if base in p.parents else None


def unique_path(folder: Path, filename: str) -> Path:
    """同名不覆蓋：自動加 _v2、_v3 …"""
    folder.mkdir(parents=True, exist_ok=True)
    stem, ext = Path(filename).stem, Path(filename).suffix.lower()
    cand = folder / f"{stem}{ext}"
    n = 2
    while cand.exists():
        cand = folder / f"{stem}_v{n}{ext}"
        n += 1
    return cand


def new_project(p: str) -> dict:
    return {
        "name": p,
        "ratio": "youtube",
        "gear": {"body": "arricam", "lens": "cooke_panchro", "stock": "v3_500t_push"},  # 35mm 底片＋復古球面鏡
        "look": "Real skin with visible pores, matte, not oily, not plastic. Layered atmospheric depth.",
        "rules": (
            "Anatomically correct hands: five fingers each, a fist has the thumb outside, every hand connects to "
            "the correct forearm and shoulder. No digital sharpening, no HDR, no plastic skin, no video-game render "
            "look. No readable text, no logos, no watermark."
        ),
        "characters": [],
        "scenes": [],
        "shots": [],
    }


# ---------------- 生成佇列（單一 worker，一次只跑一張） ----------------

def gens_path(p: str) -> Path:
    return project_dir(p) / "gens.json"


def update_version(p: str, shot_id: str, v: int, **fields) -> None:
    with lock:
        g = read_json(gens_path(p), {})
        for ver in g.get(shot_id, {}).get("versions", []):
            if ver["v"] == v:
                ver.update(fields)
        write_json(gens_path(p), g)


def worker() -> None:
    while True:
        job = jobs.get()
        job["state"] = "running"
        job["started"] = time.time()
        p, sid, v = job["project"], job["shot_id"], job["v"]
        update_version(p, sid, v, status="running")
        pdir = project_dir(p)
        frames = pdir / "frames"
        logs = frames / "logs"
        logs.mkdir(parents=True, exist_ok=True)
        stem = f"{sid}_v{v}"
        out_file = frames / f"{stem}.png"
        log_file = logs / f"{stem}.log"
        cmd = [sys.executable, "-u", str(GEN_PY), job["prompt"], "--ratio", job["ratio"],
               "--out", str(frames), "--filename", stem]
        for r in job["refs"]:
            if f := inside(pdir, r):
                cmd += ["--ref", str(f)]
        try:
            with open(log_file, "w", encoding="utf-8", errors="replace") as lf:
                rc = subprocess.run(cmd, stdout=lf, stderr=subprocess.STDOUT, cwd=str(frames),
                                    timeout=900, encoding="utf-8", errors="replace").returncode
        except subprocess.TimeoutExpired:
            rc = -1
        log = log_file.read_text(encoding="utf-8", errors="replace") if log_file.exists() else ""
        flag = "fallback" if "fallback:" in log else None
        ok = rc == 0 and out_file.exists()
        update_version(p, sid, v,
                       status="done" if ok else "failed",
                       file=f"frames/{stem}.png" if ok else None,
                       flag=flag,
                       review="check" if flag else "pending",
                       finished=time.strftime("%Y-%m-%d %H:%M:%S"),
                       log=f"frames/logs/{stem}.log")
        if ok:
            with lock:
                g = read_json(gens_path(p), {})
                g.setdefault(sid, {})["current"] = v
                write_json(gens_path(p), g)
        job["state"] = "done" if ok else "failed"
        job["finished"] = time.time()
        jobs.task_done()


STEPS = ["啟動 codex", "送出提示詞與參考圖", "生圖中（最久的一步）", "存檔"]


def job_step(job: dict) -> int:
    """依生成紀錄判斷目前在第幾步（1–4）"""
    log = project_dir(job["project"]) / "frames" / "logs" / f"{job['shot_id']}_v{job['v']}.log"
    try:
        text = log.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return 1
    # codex 的工具說明裡也提到 generated_images，所以要比對實際的輸出路徑（含工作階段資料夾）
    if "MEDIA:" in text or re.search(r"generated_images[\\/]+[0-9a-f]{8}-", text) or "Copy-Item" in text:
        return 4
    if re.search(r"imagegen[\\/]+SKILL\.md", text):  # codex 讀完生圖工具說明後就進入生圖
        return 3
    if "OpenAI Codex" in text:
        return 2
    return 1


# ---------------- 依選項改寫畫面內容（codex，純文字、唯讀沙盒） ----------------

REWRITE_RULES = """You rewrite ONE storyboard "action" line so it matches the shot settings below. Do not use any tools, do not read or write files; just answer.

Rules:
- Keep the original intent, mood and as much of the original wording as possible.
- Mention only the characters listed in characters_in_shot. Characters in characters_not_in_shot must not appear by name; if the story needs them, imply them off-screen (e.g. "an unseen opponent").
- relationship "single": only the subject is visible in the frame. "two"/"ots": both characters in the shot appear.
- Do not describe camera, lens, framing, lighting or film look; those are handled elsewhere.
- Write in the same language as the original (if the original is empty, write a short English action for the subject).
- One or two short sentences.
- Output ONLY the rewritten text: no quotes, no labels, no explanation."""


def codex_exe() -> str:
    exe = shutil.which("codex")
    if exe:
        return exe
    cand = Path.home() / "AppData" / "Roaming" / "npm" / "codex.cmd"
    return str(cand) if cand.exists() else "codex"


def rewrite_action(body: dict) -> str:
    prompt = (REWRITE_RULES + "\n\nShot settings:\n" + json.dumps(body.get("context", {}), ensure_ascii=False)
              + "\n\nOriginal action:\n" + (body.get("action") or "").strip())
    with tempfile.TemporaryDirectory() as tmp:  # 在空資料夾執行，不碰專案檔案
        out = Path(tmp) / "out.txt"
        r = subprocess.run([codex_exe(), "exec", "--skip-git-repo-check", "--ephemeral", "--sandbox", "read-only",
                            "-c", 'model_reasoning_effort="low"', "-o", str(out), "-"],
                           input=prompt, capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=180, cwd=tmp)
        text = out.read_text(encoding="utf-8", errors="replace").strip() if out.exists() else ""
    if not text:
        tail = (r.stderr or r.stdout or "").strip().splitlines()[-3:]
        raise RuntimeError("codex 沒有回傳內容：" + " / ".join(tail))
    return text.strip().strip('"“”「」').strip()


# ---------------- 匯入外部生成的圖（Midjourney 等） ----------------
IMPORT_MAX = 30 * 1024 * 1024
IMG_SIG = {b"\x89PNG": ".png", b"\xff\xd8\xff": ".jpg", b"RIFF": ".webp"}


def image_ext(data: bytes) -> str | None:
    """依檔頭判斷圖片格式，不是 png／jpg／webp 就回傳 None"""
    for sig, ext in IMG_SIG.items():
        if data.startswith(sig) and (ext != ".webp" or data[8:12] == b"WEBP"):
            return ext
    return None


def fetch_image(url: str) -> bytes:
    """下載 https 圖片網址（例如 Midjourney 成圖的 CDN），限 30MB"""
    if not url.lower().startswith("https://"):
        raise ValueError("只接受 https 圖片網址")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 storyboard-studio"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read(IMPORT_MAX + 1)
    if len(data) > IMPORT_MAX:
        raise ValueError("圖片超過 30MB")
    return data


def import_version(p: str, body: dict) -> dict:
    """把外部工具生成的圖存成這顆分鏡的新版本（設為現行版）"""
    sid = safe_name(body["shot_id"])
    data = fetch_image(body["url"]) if body.get("url") else base64.b64decode(body.get("image_b64", ""))
    if len(data) > IMPORT_MAX:
        raise ValueError("圖片超過 30MB")
    ext = image_ext(data)
    if not ext:
        raise ValueError("不是 png／jpg／webp 圖片")
    pdir = project_dir(p)
    with lock:
        g = read_json(gens_path(p), {})
        entry = g.setdefault(sid, {"versions": [], "current": None})
        v = max([x["v"] for x in entry["versions"]], default=0) + 1
        rel = f"frames/{sid}_v{v}{ext}"
        (pdir / "frames").mkdir(parents=True, exist_ok=True)
        (pdir / rel).write_bytes(data)
        now = time.strftime("%Y-%m-%d %H:%M:%S")
        entry["versions"].append({
            "v": v, "status": "done", "review": "pending", "file": rel, "flag": None,
            "source": body.get("source", "midjourney"), "prompt": body.get("prompt", ""), "prompt_zh": "",
            "code": body.get("code", ""), "refs": [r for r in body.get("refs", []) if inside(pdir, r)],
            "ratio": body.get("ratio", ""), "manual": False, "created": now, "finished": now,
        })
        entry["current"] = v
        write_json(gens_path(p), g)
    return {"v": v, "file": rel}


def enqueue(p: str, body: dict) -> dict:
    sid = body["shot_id"]
    pdir = project_dir(p)
    refs = [r for r in body.get("refs", []) if (f := inside(pdir, r)) and f.is_file()]  # 只接受專案內的檔案
    with lock:
        g = read_json(gens_path(p), {})
        entry = g.setdefault(sid, {"versions": [], "current": None})
        v = max([x["v"] for x in entry["versions"]], default=0) + 1
        entry["versions"].append({
            "v": v, "status": "queued", "review": "pending", "file": None, "flag": None,
            "prompt": body["prompt"], "prompt_zh": body.get("prompt_zh", ""),
            "code": body.get("code", ""), "refs": refs, "ratio": body.get("ratio", "youtube"),
            "manual": bool(body.get("manual")), "created": time.strftime("%Y-%m-%d %H:%M:%S"),
        })
        write_json(gens_path(p), g)
        job = {"id": f"{p}/{sid}_v{v}", "project": p, "shot_id": sid, "v": v,
               "prompt": body["prompt"], "refs": refs, "ratio": body.get("ratio", "youtube"),
               "state": "queued", "queued": time.time()}
        job_list.append(job)
    jobs.put(job)
    return {"v": v}


# ---------------- HTTP ----------------

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # 安靜一點
        pass

    def send_json(self, data, code=200):
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def send_file(self, path: Path):
        if not path.is_file():
            self.send_error(404)
            return
        # Windows 登錄檔常把 .js 對到 text/plain，模組腳本會被瀏覽器拒絕，所以自己指定
        ctype = MIME.get(path.suffix.lower()) or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def body(self) -> bytes:
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def parts(self):
        u = urllib.parse.urlparse(self.path)
        return urllib.parse.unquote(u.path), {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}

    def allowed(self, write: bool) -> bool:
        """只服務本機網頁：
        - Host 必須是 127.0.0.1／localhost（擋 DNS rebinding：惡意網域解析到 127.0.0.1 後讀取回應）
        - 寫入類請求若帶 Origin，必須是本機網頁（擋惡意網頁在背後跨站送出請求）；
          沒有 Origin 的是 curl、make_samples.mjs 這類本機程式，瀏覽器跨站一定會帶 Origin"""
        port = self.server.server_address[1]
        local = {f"127.0.0.1:{port}", f"localhost:{port}"}
        if self.headers.get("Host", "") not in local:
            return False
        if write:
            origin = self.headers.get("Origin")
            if origin is not None and origin not in {f"http://{h}" for h in local}:
                return False
            if self.headers.get("Sec-Fetch-Site") not in (None, "same-origin", "none"):
                return False
        return True

    def do_GET(self):
        if not self.allowed(write=False):
            return self.send_error(403, "forbidden")
        path, q = self.parts()
        try:
            if path == "/":
                return self.send_file(STATIC / "index.html")
            if path.startswith("/static/"):
                f = (STATIC / path[len("/static/"):]).resolve()
                if STATIC.resolve() in f.parents:
                    return self.send_file(f)
                return self.send_error(403)
            if path.startswith("/files/"):
                p, _, rel = path[len("/files/"):].partition("/")
                pdir = project_dir(p)
                f = (pdir / rel).resolve()
                if pdir in f.parents:
                    return self.send_file(f)
                return self.send_error(403)
            if path == "/api/projects":
                PROJECTS.mkdir(exist_ok=True)
                return self.send_json(sorted(d.name for d in PROJECTS.iterdir() if (d / "project.json").exists()))
            if path == "/api/project":
                return self.send_json(read_json(project_dir(q["p"]) / "project.json", None))
            if path == "/api/project_rev":
                return self.send_json({"rev": (read_json(project_dir(q["p"]) / "project.json", None) or {}).get("_rev", 0)})
            if path == "/api/gens":
                with lock:
                    return self.send_json(read_json(gens_path(q["p"]), {}))
            if path == "/api/version":  # 前端檔案最後修改時間；網頁比對後提示重新整理
                return self.send_json({"v": max(f.stat().st_mtime for f in STATIC.rglob("*") if f.is_file())})
            if path == "/api/queue":
                now = time.time()
                rows = []
                for j in job_list:
                    if not (j["state"] in ("queued", "running") or now - j.get("finished", now) < 120):
                        continue
                    row = {k: j[k] for k in ("id", "project", "shot_id", "v", "state")}
                    if j["state"] == "running":
                        step = job_step(j)
                        row |= {"elapsed": round(now - j.get("started", now)), "step": step, "steps": len(STEPS), "tail": STEPS[step - 1]}
                    rows.append(row)
                return self.send_json(rows)
            if path == "/api/log":
                f = inside(project_dir(q["p"]) / "frames" / "logs", Path(q["path"]).name)  # 只能讀生成紀錄資料夾
                return self.send_json({"text": f.read_text(encoding="utf-8", errors="replace")[-6000:] if f and f.is_file() else ""})
            self.send_error(404)
        except Exception as e:  # noqa: BLE001
            self.send_json({"error": str(e)}, 500)

    def do_POST(self):
        if not self.allowed(write=True):
            return self.send_error(403, "forbidden")
        path, q = self.parts()
        try:
            if path == "/api/projects":
                name = safe_name(json.loads(self.body())["name"])
                pj = project_dir(name) / "project.json"
                if not pj.exists():
                    write_json(pj, new_project(name))
                return self.send_json({"name": name})
            if path == "/api/project":
                # 版本號 _rev：網頁、指令工具、範例腳本都可能改同一個專案，對不上就拒絕，避免整份互相覆蓋
                data = json.loads(self.body())
                pj = project_dir(q["p"]) / "project.json"
                with lock:
                    cur = read_json(pj, None)
                    cur_rev = (cur or {}).get("_rev", 0)
                    if cur is not None and data.get("_rev", 0) != cur_rev:
                        return self.send_json({"error": "conflict", "rev": cur_rev}, 409)
                    data["_rev"] = cur_rev + 1
                    write_json(pj, data)
                return self.send_json({"ok": True, "rev": data["_rev"]})
            if path == "/api/upload":  # 原始位元組上傳：?p=&kind=characters|scenes|refs&name=
                kind = q["kind"]
                if kind not in KINDS:
                    return self.send_json({"error": "kind"}, 400)
                name = safe_name(q["name"])
                if Path(name).suffix.lower() not in IMG_EXT:
                    return self.send_json({"error": "只接受 png／jpg／webp"}, 400)
                dst = unique_path(project_dir(q["p"]) / kind, name)
                dst.write_bytes(self.body())
                return self.send_json({"path": f"{kind}/{dst.name}"})
            if path == "/api/import_path":  # 從本機現有檔案（path）或專案內檔案（rel）複製進專案，原檔不動
                b = json.loads(self.body())
                if b.get("kind") not in KINDS:
                    return self.send_json({"error": "kind"}, 400)
                pdir = project_dir(q["p"])
                if b.get("rel"):
                    src = (pdir / b["rel"]).resolve()
                    if pdir not in src.parents:
                        return self.send_json({"error": "bad path"}, 403)
                else:
                    src = Path(b["path"].strip().strip('"'))
                if not src.is_file() or src.suffix.lower() not in IMG_EXT:
                    return self.send_json({"error": f"找不到圖片：{src}"}, 400)
                dst = unique_path(pdir / b["kind"], src.name)
                shutil.copy2(src, dst)
                return self.send_json({"path": f"{b['kind']}/{dst.name}"})
            if path == "/api/snapshot":  # 3D 構圖截圖：每次另存新檔，舊版本的參考圖不會被蓋掉
                sid = safe_name(q["shot"])
                folder = project_dir(q["p"]) / "layout"
                folder.mkdir(parents=True, exist_ok=True)
                dst = folder / f"{sid}_layout_{time.strftime('%Y%m%d_%H%M%S')}.png"
                dst.write_bytes(self.body())
                return self.send_json({"path": f"layout/{dst.name}"})
            if path == "/api/rewrite_action":
                try:
                    return self.send_json({"text": rewrite_action(json.loads(self.body()))})
                except subprocess.TimeoutExpired:
                    return self.send_json({"error": "codex 超過 3 分鐘沒有回應"}, 504)
            if path == "/api/gens/import":  # Midjourney 等外部成圖：{shot_id, image_b64 或 url, prompt, refs, code}
                try:
                    return self.send_json(import_version(q["p"], json.loads(self.body())))
                except (ValueError, OSError) as e:
                    return self.send_json({"error": str(e)}, 400)
            if path == "/api/reveal":  # 在檔案總管選取專案內的檔案（方便拖到 Midjourney 網頁）
                b = json.loads(self.body())
                f = inside(project_dir(q["p"]), b.get("path", ""))
                if not f or not f.is_file():
                    return self.send_json({"error": "找不到檔案"}, 404)
                if os.name != "nt":
                    return self.send_json({"error": "只支援 Windows"}, 400)
                subprocess.Popen(["explorer", "/select,", str(f)])
                return self.send_json({"ok": True})
            if path == "/api/generate":
                if not GEN_PY.exists():
                    return self.send_json({"error": f"找不到 {GEN_PY}"}, 500)
                return self.send_json(enqueue(q["p"], json.loads(self.body())))
            if path == "/api/gens/delete":  # 刪除版本紀錄；圖檔與 log 移到 frames/_deleted/，不真的刪
                b = json.loads(self.body())
                pdir = project_dir(q["p"])
                trash = pdir / "frames" / "_deleted"
                removed = []
                with lock:
                    g = read_json(gens_path(q["p"]), {})
                    entry = g.get(b["shot_id"])
                    if not entry:
                        return self.send_json({"error": "no shot"}, 404)
                    keep = []
                    for ver in entry["versions"]:
                        if ver["v"] not in b["vs"] or ver.get("status") in ("queued", "running"):
                            keep.append(ver)
                            continue
                        for rel in (ver.get("file"), ver.get("log")):
                            src = pdir / rel if rel else None
                            if src and src.is_file():
                                trash.mkdir(parents=True, exist_ok=True)
                                shutil.move(str(src), str(unique_path(trash, src.name)))
                        removed.append(ver["v"])
                    entry["versions"] = keep
                    if entry.get("current") in removed:
                        done = [x["v"] for x in keep if x.get("file")]
                        entry["current"] = done[-1] if done else None
                    write_json(gens_path(q["p"]), g)
                return self.send_json({"removed": removed})
            if path == "/api/gens/set":  # 設現行版或核可／退回
                b = json.loads(self.body())
                with lock:
                    g = read_json(gens_path(q["p"]), {})
                    entry = g.get(b["shot_id"])
                    if not entry:
                        return self.send_json({"error": "no shot"}, 404)
                    if "current" in b:
                        entry["current"] = b["current"]
                    if "review" in b:
                        for ver in entry["versions"]:
                            if ver["v"] == b["v"]:
                                ver["review"] = b["review"]
                    write_json(gens_path(q["p"]), g)
                return self.send_json({"ok": True})
            self.send_error(404)
        except Exception as e:  # noqa: BLE001
            self.send_json({"error": str(e)}, 500)


def exit_with_parent() -> None:
    """由 run.py 啟動時（STUDIO_PARENT_PID），run.py 一結束就跟著結束，避免留下沒人管的伺服器"""
    import ctypes
    import os
    pid = int(os.environ.get("STUDIO_PARENT_PID") or 0)
    if not pid or os.name != "nt":
        return
    k32 = ctypes.windll.kernel32
    handle = k32.OpenProcess(0x00100000, False, pid)  # SYNCHRONIZE
    if not handle:
        os._exit(0)  # 父程序已經不在
    def watch():
        k32.WaitForSingleObject(handle, 0xFFFFFFFF)  # 等到父程序結束
        os._exit(0)
    threading.Thread(target=watch, daemon=True).start()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("STUDIO_PORT") or 8790))
    args = ap.parse_args()
    PROJECTS.mkdir(parents=True, exist_ok=True)
    # 上次關閉時還在排隊或生成中的版本：伺服器停掉時 codex 可能仍在背景跑完並存了圖，
    # 圖檔在就補記為完成，否則標成中斷（之前標成中斷、後來圖才出現的也一併補記）
    for gp in PROJECTS.glob("*/gens.json"):
        g = read_json(gp, {})
        for sid, entry in g.items():
            for ver in entry.get("versions", []):
                interrupted = ver.get("status") in ("queued", "running") or ver.get("finished") == "伺服器重啟，已中斷"
                if not interrupted:
                    continue
                rel = f"frames/{sid}_v{ver['v']}.png"
                if (gp.parent / rel).exists():
                    log = gp.parent / "frames" / "logs" / f"{sid}_v{ver['v']}.log"
                    ver.update(status="done", file=rel, review="pending", log=f"frames/logs/{log.name}",
                               finished=time.strftime("%Y-%m-%d %H:%M:%S", time.localtime((gp.parent / rel).stat().st_mtime)) + "（重啟後補記）")
                    if not entry.get("current"):
                        entry["current"] = ver["v"]
                elif ver.get("status") in ("queued", "running"):
                    ver["status"] = "failed"
                    ver["finished"] = "伺服器重啟，已中斷"
        write_json(gp, g)
    exit_with_parent()
    threading.Thread(target=worker, daemon=True).start()
    srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"分鏡設計台：http://127.0.0.1:{args.port}/  （Ctrl+C 結束）")
    srv.serve_forever()


if __name__ == "__main__":
    main()
