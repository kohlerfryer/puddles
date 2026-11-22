"""Fail when a branch changes source code without changing any tests."""

import argparse

from scripts.git_changes import FileChange, branch_changes, is_test

SOURCE_ROOTS = ("server/", "game/src/", "scripts/")
SOURCE_SUFFIXES = (".py", ".ts")
# Drawing and entry code isn't unit-tested (ADR: game logic in core, drawing in render).
UNTESTED = ("game/src/render/", "game/src/main.ts")


def is_source(path: str) -> bool:
    return (
        path.startswith(SOURCE_ROOTS)
        and path.endswith(SOURCE_SUFFIXES)
        and not is_test(path)
        and not path.endswith("__init__.py")
        and not path.startswith(UNTESTED)
    )


def untested_sources(changes: list[FileChange]) -> list[str]:
    """Return changed source files when no test changed alongside them."""
    if any(is_test(c.path) for c in changes):
        return []
    return sorted(c.path for c in changes if is_source(c.path) and c.status != "D")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="origin/main")
    args = parser.parse_args(argv)
    missing = untested_sources(branch_changes(args.base)[0])
    for path in missing:
        print(f"{path}:1: source changed but no test changed in this branch")
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
