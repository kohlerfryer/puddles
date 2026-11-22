"""Fail when a Python file is longer than the line limit in docs/coding-standards.md."""

import sys
from pathlib import Path

MAX_LINES = 300
ROOTS = ("server", "scripts")


def too_long(paths: list[Path], limit: int = MAX_LINES) -> list[tuple[Path, int]]:
    """Return (path, line count) for each file over the limit."""
    counts = ((path, len(path.read_text().splitlines())) for path in paths)
    return [(path, count) for path, count in counts if count > limit]


def python_files(roots: tuple[str, ...] = ROOTS) -> list[Path]:
    return sorted(path for root in roots for path in Path(root).rglob("*.py"))


def main() -> int:
    offenders = too_long(python_files())
    for path, count in offenders:
        print(f"{path}:1: file has {count} lines (limit {MAX_LINES})")
    return 1 if offenders else 0


if __name__ == "__main__":
    sys.exit(main())
