"""Pick the agent:ready issues agents may start now, or explain why none can start.

Rules (docs/workflow.md): at most MAX_AGENTS issues in progress, no new work while
main is red, and an issue waits until every issue it is blocked by is closed.
"""

import argparse
import json
import re
import subprocess
from dataclasses import dataclass

MAX_AGENTS = 4
BLOCKED_BY = re.compile(r"blocked by\W*((?:#\d+[\s,]*)+)", re.IGNORECASE)


@dataclass(frozen=True)
class Issue:
    number: int
    body: str


def blockers(body: str) -> set[int]:
    return {int(n) for match in BLOCKED_BY.finditer(body) for n in re.findall(r"#(\d+)", match[1])}


def pick(
    ready: list[Issue], open_numbers: set[int], in_progress: int, main_red: bool
) -> tuple[list[int], str]:
    """Return (issue numbers to start, reason), filling free agent slots oldest first."""
    if not ready:
        return [], "no issues are labeled agent:ready"
    if main_red:
        return [], "main is red; fix it before starting new work"
    slots = MAX_AGENTS - in_progress
    if slots <= 0:
        return [], f"{in_progress} issues already in progress (limit {MAX_AGENTS})"
    unblocked = [
        i.number
        for i in sorted(ready, key=lambda i: i.number)
        if not blockers(i.body) & open_numbers
    ]
    if not unblocked:
        return [], "every ready issue is blocked by an open issue"
    chosen = unblocked[:slots]
    return chosen, "starting " + ", ".join(f"#{n}" for n in chosen)


def gh_json(*args: str) -> list[dict[str, object]]:
    result = subprocess.run(["gh", *args], capture_output=True, text=True, check=True)
    data: list[dict[str, object]] = json.loads(result.stdout)
    return data


def open_issues(label: str = "") -> list[dict[str, object]]:
    args = ["issue", "list", "--state", "open", "--limit", "200", "--json", "number,body,title"]
    return gh_json(*args, *(["--label", label] if label else []))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--issue", type=int, help="only consider this issue")
    args = parser.parse_args(argv)
    ready = [Issue(int(str(i["number"])), str(i["body"])) for i in open_issues("agent:ready")]
    if args.issue:
        ready = [i for i in ready if i.number == args.issue]
    everything = open_issues()
    main_red = any(str(i["title"]).startswith("main is red") for i in everything)
    open_numbers = {int(str(i["number"])) for i in everything}
    numbers, reason = pick(ready, open_numbers, len(open_issues("agent:in-progress")), main_red)
    print(json.dumps({"issues": numbers, "reason": reason}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
