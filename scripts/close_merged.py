"""Close agent:in-progress issues whose closing PR has merged.

GitHub doesn't apply "Closes #n" when github-actions[bot] performs the auto-merge, so
issues would stay open and keep counting against the agent limit. Only issues still
labeled agent:in-progress are closed, so an issue the owner reopens stays open.
"""

import subprocess

from scripts.agent_dispatch import gh_json, open_issues


def referenced_issues(pr: dict[str, object]) -> set[int]:
    refs = pr.get("closingIssuesReferences")
    if not isinstance(refs, list):
        return set()
    return {int(str(ref["number"])) for ref in refs if isinstance(ref, dict)}


def issues_to_close(merged_prs: list[dict[str, object]], open_numbers: set[int]) -> list[int]:
    referenced = set().union(*(referenced_issues(pr) for pr in merged_prs))
    return sorted(referenced & open_numbers)


def main() -> int:
    merged = gh_json(
        "pr",
        "list",
        "--state",
        "merged",
        "--limit",
        "50",
        "--json",
        "number,closingIssuesReferences",
    )
    in_progress = {int(str(issue["number"])) for issue in open_issues("agent:in-progress")}
    for number in issues_to_close(merged, in_progress):
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
        subprocess.run(
            ["gh", "issue", "edit", str(number), "--remove-label", "agent:in-progress"], check=False
        )
        print(f"closed #{number}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
