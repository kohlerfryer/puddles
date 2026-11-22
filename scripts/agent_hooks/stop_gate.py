"""Stop hook: Claude can't finish while `just check` fails, up to a retry limit."""

import json
import subprocess
from pathlib import Path
from typing import Any

from scripts.agent_hooks.hook_io import read_event, tail

MAX_BLOCKS = 3
STATE_DIR = Path(".quality")


def has_local_work() -> bool:
    """True when there are uncommitted changes or commits not yet on origin/main."""
    status = subprocess.run(
        ["git", "status", "--porcelain"], capture_output=True, text=True, check=False
    )
    ahead = subprocess.run(
        ["git", "rev-list", "--count", "origin/main..HEAD"],
        capture_output=True,
        text=True,
        check=False,
    )
    return bool(status.stdout.strip()) or ahead.stdout.strip() not in ("", "0")


def bump_block_count(session_id: str, state_dir: Path = STATE_DIR) -> int:
    state_dir.mkdir(exist_ok=True)
    counter = state_dir / f"stop-blocks-{session_id}"
    count = int(counter.read_text()) + 1 if counter.exists() else 1
    counter.write_text(str(count))
    return count


def clear_block_count(session_id: str, state_dir: Path = STATE_DIR) -> None:
    (state_dir / f"stop-blocks-{session_id}").unlink(missing_ok=True)


def decide(event: dict[str, Any], state_dir: Path = STATE_DIR) -> dict[str, str] | None:
    """Return the hook's JSON reply, or None to let Claude stop."""
    session_id = str(event.get("session_id", "unknown"))
    if not has_local_work():
        return None
    result = subprocess.run(["just", "check"], capture_output=True, text=True, check=False)
    if result.returncode == 0:
        clear_block_count(session_id, state_dir)
        return None
    if bump_block_count(session_id, state_dir) > MAX_BLOCKS:
        clear_block_count(session_id, state_dir)
        return {
            "systemMessage": "just check still fails after 3 attempts. "
            "Label the issue needs-human and explain what is blocking."
        }
    return {
        "decision": "block",
        "reason": "just check fails. Fix these before finishing:\n"
        + tail(result.stdout + result.stderr),
    }


def main() -> int:
    reply = decide(read_event())
    if reply:
        print(json.dumps(reply))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
