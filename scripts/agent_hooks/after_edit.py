"""PostToolUse hook: format the edited file, then check it and report violations to Claude."""

import subprocess
import sys
from pathlib import Path
from typing import Any

from scripts.agent_hooks.hook_io import read_event, tail


def relative_source(file_path: str, project_dir: str) -> str | None:
    """Return the repo-relative path when it is a file the gates check, else None."""
    path = Path(file_path)
    if path.is_absolute():
        if not path.is_relative_to(project_dir):
            return None
        path = path.relative_to(project_dir)
    rel = path.as_posix()
    if rel.endswith(".py") or (rel.startswith("game/") and rel.endswith(".ts")):
        return rel
    return None


def format_command(rel: str) -> list[str]:
    if rel.endswith(".py"):
        return ["uv", "run", "ruff", "format", rel]
    return ["pnpm", "-C", "game", "exec", "prettier", "--write", rel.removeprefix("game/")]


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, capture_output=True, text=True, check=False)


def check_edit(event: dict[str, Any]) -> str | None:
    """Format and check the edited file. Return a failure report, or None when it is clean."""
    file_path = event.get("tool_input", {}).get("file_path")
    rel = relative_source(str(file_path or ""), str(event.get("cwd", "")))
    if rel is None or not Path(rel).exists():
        return None
    run(format_command(rel))
    result = run(["just", "check-files", rel])
    if result.returncode == 0:
        return None
    return f"{rel} fails the quality gates. Fix these before moving on:\n" + tail(
        result.stdout + result.stderr
    )


def main() -> int:
    report = check_edit(read_event())
    if report:
        print(report, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
