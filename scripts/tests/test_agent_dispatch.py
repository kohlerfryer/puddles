import json
import subprocess

import pytest

from scripts import agent_dispatch
from scripts.agent_dispatch import MAX_AGENTS, Issue, blockers, overlaps, pick, touches

BUSY = [Issue(100 + n, "") for n in range(MAX_AGENTS)]


def test_reads_blockers_from_plain_and_form_bodies() -> None:
    assert blockers("Do it.\n\nBlocked by: #3, #4") == {3, 4}
    assert blockers("### Blocked by\n\n#12 #14\n\n### Risk guess") == {12, 14}
    assert blockers("### Blocked by\n\n_No response_") == set()


def test_picks_oldest_unblocked_issue() -> None:
    ready = [Issue(9, ""), Issue(7, "Blocked by: #2"), Issue(8, "")]

    assert pick(ready, open_numbers={2, 7, 8, 9}, in_progress=[], main_red=False)[0] == [8, 9]


def test_fills_only_free_slots() -> None:
    ready = [Issue(n, "") for n in (1, 2, 3, 4, 5)]

    assert pick(ready, set(range(1, 6)), in_progress=BUSY[:2], main_red=False) == (
        [1, 2],
        "starting #1, #2",
    )


def test_starts_issue_once_blockers_close() -> None:
    assert pick([Issue(7, "Blocked by: #2")], {7}, [], False)[0] == [7]


@pytest.mark.parametrize(
    ("in_progress", "main_red", "reason"),
    [(BUSY, False, "already in progress"), ([], True, "main is red")],
)
def test_waits_when_busy_or_red(in_progress: list[Issue], main_red: bool, reason: str) -> None:
    numbers, why = pick([Issue(5, "")], {5}, in_progress, main_red)

    assert numbers == []
    assert reason in why


def test_reports_when_nothing_is_ready() -> None:
    assert pick([], set(), [], False) == ([], "no issues are labeled agent:ready")


def test_reports_when_everything_is_blocked() -> None:
    numbers, why = pick([Issue(5, "Blocked by #4")], {4, 5}, [], False)

    assert numbers == []
    assert "blocked" in why


def test_reads_touched_paths() -> None:
    assert touches("Do it.\n\nTouches: scripts/agent_dispatch.py, server/ ,`docs/`") == {
        "scripts/agent_dispatch.py",
        "server/",
        "docs/",
    }
    assert touches("Do it.\n\nBlocked by: #3") == set()


@pytest.mark.parametrize(
    ("a", "b", "expected"),
    [
        ("server/app.py", "server/app.py", True),
        ("server/", "server/puddles_server/app.py", True),
        ("server/puddles_server/app.py", "server", True),
        ("server/app.py", "server/app.pyx", False),
        ("server/", "scripts/", False),
        ("game/src/core/", "game/src/render/x.ts", False),
    ],
)
def test_paths_overlap_by_file_or_folder_prefix(a: str, b: str, expected: bool) -> None:
    assert overlaps({a}, {b}) is expected
    assert overlaps({b}, {a}) is expected


def test_skips_ready_issue_touching_in_progress_paths() -> None:
    ready = [Issue(8, "Touches: server/app.py"), Issue(9, "Touches: game/")]
    busy = [Issue(3, "Touches: server/")]

    numbers, why = pick(ready, {3, 8, 9}, busy, False)

    assert numbers == [9]
    assert "#8 waits for #3 (both touch the same paths)" in why


def test_never_starts_two_overlapping_issues_together() -> None:
    ready = [Issue(8, "Touches: scripts/"), Issue(9, "Touches: scripts/guard.py")]

    numbers, why = pick(ready, {8, 9}, [], False)

    assert numbers == [8]
    assert "#9 waits for #8" in why


def test_issues_without_touches_never_conflict() -> None:
    ready = [Issue(8, ""), Issue(9, "Touches: server/")]

    assert pick(ready, {3, 8, 9}, [Issue(3, "")], False) == ([8, 9], "starting #8, #9")


def test_reports_when_every_ready_issue_overlaps() -> None:
    numbers, why = pick(
        [Issue(8, "Touches: server/")], {3, 8}, [Issue(3, "Touches: server/")], False
    )

    assert numbers == []
    assert why == "#8 waits for #3 (both touch the same paths)"


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
    assert json.loads(capsys.readouterr().out) == {"issues": [6], "reason": "starting #6"}


def test_gh_json_parses_output(monkeypatch: pytest.MonkeyPatch) -> None:
    class Done:
        stdout = '[{"number": 1}]'

    monkeypatch.setattr(subprocess, "run", lambda *_a, **_k: Done())

    assert agent_dispatch.gh_json("issue", "list") == [{"number": 1}]
