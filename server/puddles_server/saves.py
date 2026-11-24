"""The one local save (spec §11), kept as inspectable JSON on this machine.

The game decides what goes in the save and keeps only known fields; this module just keeps the
latest copy on disk, in `~/Puddles/save/` unless `PUDDLES_SAVE_DIR` names another folder.
"""

import json
import os
from pathlib import Path
from typing import Any

SAVE_DIR_ENV = "PUDDLES_SAVE_DIR"
SAVE_FILE = "save.json"
MAX_SAVE_BYTES = 256 * 1024


def save_dir() -> Path:
    folder = os.environ.get(SAVE_DIR_ENV)
    return Path(folder) if folder else Path.home() / "Puddles" / "save"


def read_save() -> dict[str, Any]:
    """The stored save, or an empty one when none is stored or it can't be read."""
    try:
        save = json.loads((save_dir() / SAVE_FILE).read_text())
    except (OSError, ValueError):
        return {}
    return save if isinstance(save, dict) else {}


def write_save(save: dict[str, Any]) -> None:
    """Replaces the stored save in one step, so a crash never leaves half a file."""
    folder = save_dir()
    folder.mkdir(parents=True, exist_ok=True)
    partial = folder / f"{SAVE_FILE}.partial"
    partial.write_text(json.dumps(save, indent=2, ensure_ascii=False) + "\n")
    partial.replace(folder / SAVE_FILE)
