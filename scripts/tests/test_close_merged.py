import subprocess

import pytest

from scripts import close_merged
from scripts.close_merged import issues_to_close, referenced_issues


def test_reads_closing_references() -> None:
    assert referenced_issues({"closingIssuesReferences": [{"number": 14}, {"number": 3}]}) == {
        3,
        14,
    }
    assert referenced_issues({"number": 9}) == set()


def test_closes_only_open_referenced_issues() -> None:
    merged = [
        {"number": 18, "closingIssuesReferences": [{"number": 14}]},
        {"number": 13, "closingIssuesReferences": [{"number": 6}]},
        {"number": 12, "closingIssuesReferences": []},
    ]

    assert issues_to_close(merged, open_numbers={6, 14, 20}) == [6, 14]
    assert issues_to_close([], open_numbers={6}) == []


def test_main_closes_and_unlabels(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(
        close_merged,
        "gh_json",
        lambda *_args: [{"number": 18, "closingIssuesReferences": [{"number": 14}]}],
    )
    labeled = {"agent:in-progress": [{"number": 14}]}
    monkeypatch.setattr(close_merged, "open_issues", lambda label="": labeled.get(label, []))
    monkeypatch.setattr(subprocess, "run", lambda command, **_: calls.append(command))

    assert close_merged.main() == 0
    assert calls[0][:4] == ["gh", "issue", "close", "14"]
    assert calls[1][-1] == "agent:in-progress"


def test_main_leaves_reopened_issues_alone(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(
        close_merged,
        "gh_json",
        lambda *_args: [{"number": 18, "closingIssuesReferences": [{"number": 14}]}],
    )
    monkeypatch.setattr(close_merged, "open_issues", lambda label="": [])
    monkeypatch.setattr(subprocess, "run", lambda command, **_: calls.append(command))

    assert close_merged.main() == 0
    assert calls == []
