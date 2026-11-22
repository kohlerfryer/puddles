"""Close agent:in-progress issues whose closing PR merged during the current attempt.

GitHub doesn't apply "Closes #n" when github-actions[bot] performs the auto-merge, so
issues would stay open and keep counting against the agent limit. A PR only counts if it
merged after the issue was last labeled agent:in-progress, so an old PR never closes an
issue that was reopened and is being worked again.
"""

import subprocess

from scripts.agent_dispatch import gh_json, open_issues

IN_PROGRESS = "agent:in-progress"


def referenced_issues(pr: dict[str, object]) -> set[int]:
    refs = pr.get("closingIssuesReferences")
    if not isinstance(refs, list):
        return set()
    return {int(str(ref["number"])) for ref in refs if isinstance(ref, dict)}


def issues_to_close(
    merged_prs: list[dict[str, object]], in_progress_since: dict[int, str]
) -> list[int]:
    """Issues with a referencing PR merged after their latest in-progress label (ISO times)."""
    return sorted(
        number
        for number, since in in_progress_since.items()
        if any(
            number in referenced_issues(pr) and str(pr.get("mergedAt", "")) > since
            for pr in merged_prs
        )
    )


def labeled_at(number: int) -> str:
    """Time the issue was last labeled agent:in-progress."""
    match = f'.event == "labeled" and .label.name == "{IN_PROGRESS}"'
    jq = f"[.[] | select({match}) | .created_at] | last"
    result = subprocess.run(
        ["gh", "api", f"repos/{{owner}}/{{repo}}/issues/{number}/events", "--paginate", "--jq", jq],
        capture_output=True,
        text=True,
        check=True,
    )
    # --jq prints plain strings, one line per page of events; keep the latest real time.
    times = [line for line in result.stdout.splitlines() if line not in ("", "null")]
    return times[-1] if times else ""


def close(number: int) -> None:
    subprocess.run(
        [
            "gh",
            "issue",
            "close",
            str(number),
            "--reason",
            "completed",
            "--comment",
            "Closed because its PR merged.",
        ],
        check=True,
    )
    # The issue is already closed and closed issues don't count toward the agent limit,
    # so a failed label removal is harmless.
    subprocess.run(["gh", "issue", "edit", str(number), "--remove-label", IN_PROGRESS], check=False)
    print(f"closed #{number}")


def main() -> int:
    merged = gh_json(
        "pr",
        "list",
        "--state",
        "merged",
        "--limit",
        "50",
        "--json",
        "number,closingIssuesReferences,mergedAt",
    )
    since = {
        int(str(i["number"])): labeled_at(int(str(i["number"]))) for i in open_issues(IN_PROGRESS)
    }
    for number in issues_to_close(merged, since):
        close(number)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
