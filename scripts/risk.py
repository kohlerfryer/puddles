"""Classify a branch as risk:low or risk:high, following docs/workflow.md.

High-risk paths come from .github/CODEOWNERS, so there is one list to maintain.
A risk:high label already on the PR is kept: agents and reviewers can raise risk,
and nothing lowers it.
"""

import argparse
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path

from scripts.git_changes import FileChange, branch_changes, is_test

MAX_LINES = 400
LOCKFILES = frozenset({"uv.lock", "game/pnpm-lock.yaml"})
SUPPRESSION = re.compile(
    r"#\s*noqa|type:\s*ignore|eslint-disable|@ts-(ignore|expect-error|nocheck)"
    r"|pragma:\s*no\s*cover|(istanbul|c8|v8)\s+ignore"
)


@dataclass(frozen=True)
class Assessment:
    level: str
    reasons: list[str]


def owned_paths(codeowners: str) -> list[str]:
    """Return the path patterns from a CODEOWNERS file, without leading slashes."""
    lines = (line.split("#")[0].split() for line in codeowners.splitlines())
    return [parts[0].lstrip("/") for parts in lines if parts]


def is_owned(path: str, patterns: list[str]) -> bool:
    return any(
        path.startswith(pattern) if pattern.endswith("/") else path == pattern
        for pattern in patterns
    )


def assess(
    changes: list[FileChange], added: list[str], patterns: list[str], labels: list[str]
) -> Assessment:
    reasons = []
    owned = sorted(c.path for c in changes if is_owned(c.path, patterns))
    if owned:
        reasons.append(f"touches high-risk paths: {', '.join(owned)}")
    size = sum(c.added + c.deleted for c in changes if c.path not in LOCKFILES)
    if size > MAX_LINES:
        reasons.append(f"changes {size} lines (limit {MAX_LINES})")
    deleted_tests = sorted(c.path for c in changes if c.status == "D" and is_test(c.path))
    if deleted_tests:
        reasons.append(f"deletes tests: {', '.join(deleted_tests)}")
    suppressions = sum(1 for line in added if SUPPRESSION.search(line))
    if suppressions:
        reasons.append(f"adds {suppressions} lint, type or coverage suppression(s)")
    if "risk:high" in labels:
        reasons.append("already labeled risk:high")
    return Assessment("high" if reasons else "low", reasons)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="origin/main")
    parser.add_argument("--labels", default="", help="comma-separated labels on the PR")
    args = parser.parse_args(argv)
    changes, added = branch_changes(args.base)
    patterns = owned_paths(Path(".github/CODEOWNERS").read_text())
    labels = [label for label in args.labels.split(",") if label]
    print(json.dumps(asdict(assess(changes, added, patterns, labels))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
