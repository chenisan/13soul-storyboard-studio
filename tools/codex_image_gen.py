#!/usr/bin/env python3
"""
codex-image — 透過 Codex CLI + ChatGPT 訂閱生圖

用法:
  python gen.py "<prompt>" [--ratio square|reel|youtube] [--out <dir>] [--filename <slug>] [--ref <img>]...
  python gen.py --batch batch.json

前置需求:
  1. npm install -g @openai/codex
  2. codex login  (選 Sign in with ChatGPT)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

RATIO_TO_SIZE = {
    "square": "1024×1024",
    "reel": "1024×1792",
    "youtube": "1792×1024",
}

RATIO_TO_ASPECT_HINT = {
    "square": "square 1:1 composition",
    "reel": "vertical 9:16 portrait composition",
    "youtube": "horizontal 16:9 landscape composition",
}


def slugify(text: str, max_len: int = 40) -> str:
    t = re.sub(r"[^a-z0-9]+", "-", text[:max_len].lower()).strip("-")
    return t or "image"


def build_codex_prompt(task: dict) -> str:
    """Build a short, single-image prompt that codex won't second-guess.

    Critical: codex will normally augment/restructure prompts via its imagegen
    skill schema. We use a fenced verbatim block + explicit no-rewrite directive
    so the user prompt reaches image_gen unchanged.
    """
    aspect_hint = RATIO_TO_ASPECT_HINT[task['ratio']]
    verbatim_prompt = f"{task['prompt']}, {aspect_hint}"
    refs = task.get("refs") or []
    ref_block = ""
    if refs:
        ref_list = "\n".join(f"- {r}" for r in refs)
        ref_block = (
            f"先讀取下列參考圖檔案，並把它們當成 image_gen 的參考圖（image-to-image / 編輯模式）輸入，"
            f"生成結果必須嚴格保持參考圖中角色的外觀、五官、配色、比例與繪畫筆觸風格：\n"
            f"{ref_list}\n\n"
        )
    return (
        f"{ref_block}"
        f"使用內建 image_gen 工具立即生成 1 張圖片，"
        f"尺寸 {RATIO_TO_SIZE[task['ratio']]}，最終存到 {task['out_path']}。\n\n"
        f"請把下方 ===PROMPT START=== 與 ===PROMPT END=== 之間的內容，"
        f"**一字不漏 verbatim** 當成 image_gen 的 prompt 參數傳入。"
        f"不要重新表述、不要套用 imagegen 的 schema 包裝、不要新增或刪除任何字。\n\n"
        f"===PROMPT START===\n"
        f"{verbatim_prompt}\n"
        f"===PROMPT END===\n\n"
        f"立即呼叫 image_gen，不要詢問格式，不要先回覆文字確認。"
    )


def resolve_codex_exe() -> str:
    """Return an executable path for the codex CLI.

    Windows npm shims are .cmd/.ps1 files; Python's subprocess won't resolve
    bare 'codex' without PATHEXT handling. shutil.which tries all PATHEXT
    entries and returns the full path that subprocess can launch.
    """
    exe = shutil.which("codex")
    if exe:
        return exe
    # fallback: default npm-global shim on Windows
    if os.name == "nt":
        candidate = Path(os.environ.get("APPDATA", "")) / "npm" / "codex.cmd"
        if candidate.exists():
            return str(candidate)
    return "codex"  # let subprocess fail with a clear error


def run_codex(prompt: str, cwd: Path, timeout: int) -> int:
    exe = resolve_codex_exe()
    cmd = [exe, "exec", "--sandbox", "workspace-write", "--skip-git-repo-check", "-"]
    print(f"[codex-image] 呼叫 codex exec（{len(prompt)} chars prompt via stdin） via {exe}")
    result = subprocess.run(
        cmd,
        cwd=str(cwd),
        capture_output=False,
        timeout=timeout,
        input=prompt,
        text=True,
        encoding="utf-8",
    )
    return result.returncode


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("prompt", nargs="?", help="圖片描述（單張用）")
    ap.add_argument("--ratio", choices=["square", "reel", "youtube"],
                    default="square")
    ap.add_argument("--out", default=".", help="輸出資料夾")
    ap.add_argument("--filename", help="指定檔名（不含副檔名）")
    ap.add_argument("--ref", action="append", default=[],
                    help="參考圖路徑（可重複給多張）")
    ap.add_argument("--batch", help="批次 JSON 檔（list of {prompt, ratio, filename}）")
    ap.add_argument("--timeout", type=int, default=600,
                    help="codex exec 逾時秒數（預設 600）")
    return ap.parse_args()


def main() -> int:
    args = parse_args()

    if args.batch:
        batch_path = Path(args.batch)
        if not batch_path.exists():
            print(f"❌ batch file not found: {batch_path}", file=sys.stderr)
            return 1
        raw_tasks = json.loads(batch_path.read_text(encoding="utf-8"))
    elif args.prompt:
        raw_tasks = [{
            "prompt": args.prompt,
            "ratio": args.ratio,
            "filename": args.filename,
            "ref": args.ref,
        }]
    else:
        print("❌ 必須給 prompt 或 --batch", file=sys.stderr)
        return 1

    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    tasks = []
    for t in raw_tasks:
        ratio = t.get("ratio", "square")
        if ratio not in RATIO_TO_SIZE:
            print(f"❌ 不支援的 ratio: {ratio}", file=sys.stderr)
            return 1
        filename = t.get("filename") or slugify(t["prompt"])
        if not filename.endswith(".png"):
            filename += ".png"
        out_path = out_dir / filename
        refs_raw = t.get("ref") or []
        if isinstance(refs_raw, str):
            refs_raw = [refs_raw]
        refs = []
        for r in refs_raw:
            rp = Path(r).resolve()
            if not rp.exists():
                print(f"❌ 參考圖不存在: {rp}", file=sys.stderr)
                return 1
            refs.append(str(rp).replace("\\", "/"))
        tasks.append({
            "refs": refs,
            "prompt": t["prompt"],
            "ratio": ratio,
            "filename": filename,
            "out_path": str(out_path).replace("\\", "/"),
        })

    cache = Path.home() / ".codex" / "generated_images"

    def cache_max_mtime() -> float:
        if not cache.exists():
            return 0.0
        files = list(cache.rglob("*.png"))
        return max((f.stat().st_mtime for f in files), default=0.0)

    import shutil as _sh

    failed = []
    for idx, t in enumerate(tasks, 1):
        print(f"\n[codex-image] === ({idx}/{len(tasks)}) {t['filename']} ===")
        baseline_mtime = cache_max_mtime()
        prompt = build_codex_prompt(t)
        rc = run_codex(prompt, cwd=out_dir, timeout=args.timeout)

        if rc != 0:
            print(f"[codex-image] ❌ exit {rc}", file=sys.stderr)
            failed.append(t)
            continue

        # 已存在於 out_path 就直接通過
        if Path(t["out_path"]).exists() and Path(t["out_path"]).stat().st_mtime > baseline_mtime - 1:
            print(f"MEDIA:{t['out_path']}")
            continue

        # fallback：只認 baseline 之後新生的圖（避免抓到舊快取）
        if cache.exists():
            new_files = sorted(
                (f for f in cache.rglob("*.png") if f.stat().st_mtime > baseline_mtime),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            if new_files:
                _sh.copy2(new_files[0], t["out_path"])
                print(f"[codex-image] fallback: {new_files[0].name} → {t['out_path']}")
                print(f"MEDIA:{t['out_path']}")
                continue

        print(f"[codex-image] ⚠️  沒抓到 baseline 之後的新圖，可能 codex 沒真的生圖", file=sys.stderr)
        failed.append(t)

    if failed:
        print("\n⚠️  下列檔案未產出：", file=sys.stderr)
        for t in failed:
            print(f"   - {t['out_path']}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
