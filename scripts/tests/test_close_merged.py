import subprocess

import pytest

from scripts import close_merged
from scripts.close_merged import issues_to_close, labeled_at, referenced_issues

PR_18 = {
    "number": 18,
    "mergedAt": "2026-11-22T09:22:30Z",
    "closingIssuesReferences": [{"number": 14}],
}


def test_reads_closing_references() -> None:
    assert referenced_issues({"closingIssuesReferences": [{"number": 14}, {"number": 3}]}) == {
        3,
        14,
    }
    assert referenced_issues({"number": 9}) == set()


def test_closes_issue_whose_pr_merged_during_the_attempt() -> None:
    assert issues_to_close([PR_18], {14: "2026-11-22T09:20:40Z"}) == [14]


def test_keeps_issue_reopened_after_an_older_pr() -> None:
    assert issues_to_close([PR_18], {14: "2026-11-23T10:00:00Z"}) == []


def test_ignores_unreferenced_issues() -> None:
    assert issues_to_close([PR_18], {20: "2026-11-22T09:00:00Z"}) == []


def fake_run(stdout: str, calls: list[list[str]]) -> object:
    def run(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        calls.append(command)
        return subprocess.CompletedProcess(command, 0, stdout=stdout, stderr="")

    return run


def test_labeled_at_reads_latest_label_event(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(subprocess, "run", fake_run("2026-11-22T09:20:40Z\nnull\n", calls))

    assert labeled_at(14) == "2026-11-22T09:20:40Z"
    assert calls[0][2].endswith("/issues/14/events")

    monkeypatch.setattr(subprocess, "run", fake_run("null\n", calls))
    assert labeled_at(14) == ""


def test_main_closes_and_unlabels(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(close_merged, "gh_json", lambda *_args: [PR_18])
    monkeypatch.setattr(close_merged, "open_issues", lambda label="": [{"number": 14}])
    monkeypatch.setattr(close_merged, "labeled_at", lambda _n: "2026-11-22T09:20:40Z")
    monkeypatch.setattr(subprocess, "run", fake_run("", calls))

    assert close_merged.main() == 0
    assert calls[0][:4] == ["gh", "issue", "close", "14"]
    assert calls[1][-1] == "agent:in-progress"
