"""Pick the agent:ready issues agents may start now, or explain why none can start.

Rules (docs/workflow.md): at most MAX_AGENTS issues in progress, no new work while
main is red, an issue waits until every issue it is blocked by is closed, and two issues
whose `Touches:` paths overlap never run at once.
"""

import argparse
import json
import re
import subprocess
from dataclasses import dataclass

MAX_AGENTS = 4
BLOCKED_BY = re.compile(r"blocked by\W*((?:#\d+[\s,]*)+)", re.IGNORECASE)
TOUCHES = re.compile(r"^touches:(.*)$", re.IGNORECASE | re.MULTILINE)


@dataclass(frozen=True)
class Issue:
    number: int
    body: str


def blockers(body: str) -> set[int]:
    return {int(n) for match in BLOCKED_BY.finditer(body) for n in re.findall(r"#(\d+)", match[1])}


def touches(body: str) -> set[str]:
    """Files or folder prefixes from the issue's `Touches: a, b/` lines."""
    return {
        path.strip(" `")
        for match in TOUCHES.finditer(body)
        for path in match[1].split(",")
        if path.strip(" `")
    }


def overlaps(paths: set[str], others: set[str]) -> bool:
    """True when a path in one set is the same as, or inside a folder in, the other."""
    return any(
        a == b or a.startswith(b + "/") or b.startswith(a + "/")
        for a in (p.rstrip("/") for p in paths)
        for b in (o.rstrip("/") for o in others)
    )


def spread(
    candidates: list[Issue], running: list[Issue], slots: int
) -> tuple[list[Issue], list[str]]:
    """Choose up to `slots` candidates whose paths overlap no running or chosen issue."""
    chosen: list[Issue] = []
    waits: list[str] = []
    for issue in candidates:
        if len(chosen) == slots:
            break
        paths = touches(issue.body)
        clash = next((r for r in [*running, *chosen] if overlaps(paths, touches(r.body))), None)
        if clash:
            waits.append(f"#{issue.number} waits for #{clash.number} (both touch the same paths)")
        else:
            chosen.append(issue)
    return chosen, waits


def pick(
    ready: list[Issue], open_numbers: set[int], in_progress: list[Issue], main_red: bool
) -> tuple[list[int], str]:
    """Return (issue numbers to start, reason), filling free agent slots oldest first."""
    if not ready:
        return [], "no issues are labeled agent:ready"
    if main_red:
        return [], "main is red; fix it before starting new work"
    slots = MAX_AGENTS - len(in_progress)
    if slots <= 0:
        return [], f"{len(in_progress)} issues already in progress (limit {MAX_AGENTS})"
    unblocked = [
        i for i in sorted(ready, key=lambda i: i.number) if not blockers(i.body) & open_numbers
    ]
    if not unblocked:
        return [], "every ready issue is blocked by an open issue"
    chosen, waits = spread(unblocked, in_progress, slots)
    starting = ["starting " + ", ".join(f"#{i.number}" for i in chosen)] if chosen else []
    return [i.number for i in chosen], "; ".join(starting + waits)


def gh_json(*args: str) -> list[dict[str, object]]:
    result = subprocess.run(["gh", *args], capture_output=True, text=True, check=True)
    data: list[dict[str, object]] = json.loads(result.stdout)
    return data


def open_issues(label: str = "") -> list[dict[str, object]]:
    args = ["issue", "list", "--state", "open", "--limit", "200", "--json", "number,body,title"]
    return gh_json(*args, *(["--label", label] if label else []))


def issues(label: str) -> list[Issue]:
    return [Issue(int(str(i["number"])), str(i["body"])) for i in open_issues(label)]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--issue", type=int, help="only consider this issue")
    args = parser.parse_args(argv)
    ready = issues("agent:ready")
    if args.issue:
        ready = [i for i in ready if i.number == args.issue]
    everything = open_issues()
    main_red = any(str(i["title"]).startswith("main is red") for i in everything)
    open_numbers = {int(str(i["number"])) for i in everything}
    numbers, reason = pick(ready, open_numbers, issues("agent:in-progress"), main_red)
    print(json.dumps({"issues": numbers, "reason": reason}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
