"""Read what a branch changes relative to a base ref."""

import subprocess
from dataclasses import dataclass

TEST_MARKERS = ("/tests/", ".test.ts")


@dataclass(frozen=True)
class FileChange:
    path: str
    status: str
    added: int
    deleted: int


def is_test(path: str) -> bool:
    return any(marker in path for marker in TEST_MARKERS) or path.startswith("tests/")


def git(*args: str) -> str:
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


def parse_changes(name_status: str, numstat: str) -> list[FileChange]:
    """Combine `git diff --name-status` and `--numstat` output into FileChanges."""
    statuses = {}
    for line in name_status.splitlines():
        status, *paths = line.split("\t")
        statuses[paths[-1]] = status[0]
    changes = []
    for line in numstat.splitlines():
        added, deleted, path = line.split("\t", 2)
        path = path.split(" => ")[-1].rstrip("}")
        lines_added = int(added) if added.isdigit() else 0
        lines_deleted = int(deleted) if deleted.isdigit() else 0
        changes.append(FileChange(path, statuses.get(path, "M"), lines_added, lines_deleted))
    return changes


def added_lines(diff: str) -> list[str]:
    """Return the added lines from a unified diff, without the leading '+'."""
    return [
        line[1:]
        for line in diff.splitlines()
        if line.startswith("+") and not line.startswith("+++")
    ]


def branch_changes(base: str) -> tuple[list[FileChange], list[str]]:
    """Changed files and added lines between the merge base with `base` and HEAD."""
    span = f"{base}...HEAD"
    changes = parse_changes(git("diff", "--name-status", span), git("diff", "--numstat", span))
    return changes, added_lines(git("diff", "-U0", span))
