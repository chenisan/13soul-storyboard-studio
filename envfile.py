"""讀取同資料夾的 .env（KEY=VALUE，# 開頭為註解），不需要安裝套件。
已經在環境變數裡的值優先，不會被 .env 覆蓋。"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load_env(path: Path = ROOT / ".env") -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ.setdefault(key.strip(), value)


def env_path(key: str, default: Path) -> Path:
    """路徑型設定：空白就用預設值；相對路徑以專案資料夾為準"""
    value = os.environ.get(key, "").strip()
    if not value:
        return default
    p = Path(os.path.expandvars(os.path.expanduser(value)))
    return p if p.is_absolute() else (ROOT / p).resolve()
