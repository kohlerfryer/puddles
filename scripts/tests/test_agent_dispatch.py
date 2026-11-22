import json
import subprocess

import pytest

from scripts import agent_dispatch
from scripts.agent_dispatch import MAX_AGENTS, Issue, blockers, pick


def test_reads_blockers_from_plain_and_form_bodies() -> None:
    assert blockers("Do it.\n\nBlocked by: #3, #4") == {3, 4}
    assert blockers("### Blocked by\n\n#12 #14\n\n### Risk guess") == {12, 14}
    assert blockers("### Blocked by\n\n_No response_") == set()


def test_picks_oldest_unblocked_issue() -> None:
    ready = [Issue(9, ""), Issue(7, "Blocked by: #2"), Issue(8, "")]

    assert pick(ready, open_numbers={2, 7, 8, 9}, in_progress=0, main_red=False)[0] == 8


def test_starts_issue_once_blockers_close() -> None:
    assert pick([Issue(7, "Blocked by: #2")], {7}, 0, False)[0] == 7


@pytest.mark.parametrize(
    ("in_progress", "main_red", "reason"),
    [(MAX_AGENTS, False, "already in progress"), (0, True, "main is red")],
)
def test_waits_when_busy_or_red(in_progress: int, main_red: bool, reason: str) -> None:
    number, why = pick([Issue(5, "")], {5}, in_progress, main_red)

    assert number is None
    assert reason in why


def test_reports_when_nothing_is_ready() -> None:
    assert pick([], set(), 0, False) == (None, "no issues are labeled agent:ready")


def test_reports_when_everything_is_blocked() -> None:
    number, why = pick([Issue(5, "Blocked by #4")], {4, 5}, 0, False)

    assert number is None
    assert "blocked" in why


def test_main_reads_github(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    issues = {
        "agent:ready": [{"number": 6, "body": "", "title": "Agent workflows"}],
        "agent:in-progress": [],
        "": [{"number": 6, "body": "", "title": "Agent workflows"}],
    }
    monkeypatch.setattr(agent_dispatch, "open_issues", lambda label="": issues[label])

    assert agent_dispatch.main(["--issue", "6"]) == 0
    assert json.loads(capsys.readouterr().out) == {"issue": 6, "reason": "starting #6"}


def test_gh_json_parses_output(monkeypatch: pytest.MonkeyPatch) -> None:
    class Done:
        stdout = '[{"number": 1}]'

    monkeypatch.setattr(subprocess, "run", lambda *_a, **_k: Done())

    assert agent_dispatch.gh_json("issue", "list") == [{"number": 1}]
