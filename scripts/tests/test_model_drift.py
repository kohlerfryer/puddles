import json
import subprocess
from pathlib import Path
from typing import Any

import pytest

from scripts import cassettes, model_drift
from scripts.model_drift import TITLE, check, file_issue, main, report

RUN_URL = "https://github.com/o/r/actions/runs/7"


class RawModel:
    name = "raw"
    model_id = "test/raw-1"

    def __init__(self, replies: dict[bytes, str]) -> None:
        self.replies = replies

    def raw(self, image: bytes) -> str:
        return self.replies[image]

    def react(self, image: bytes) -> dict[str, Any]:
        raise AssertionError("drift compares the raw reply")


@pytest.fixture
def recorded(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Two photos with a smolvlm cassette recorded from a model that names them right."""
    photos = tmp_path / "photos"
    photos.mkdir()
    (photos / "cup.jpg").write_bytes(b"cup")
    (photos / "sock.jpg").write_bytes(b"sock")
    monkeypatch.setattr(cassettes, "PHOTOS", photos)
    monkeypatch.setattr(cassettes, "CASSETTES", tmp_path / "cassettes")
    cassettes.CASSETTES.mkdir()
    cassette = cassettes.record(RawModel({b"cup": "a cup", b"sock": "a sock"}), photos)
    cassettes.path_for("smolvlm").write_text(json.dumps(cassette))
    return tmp_path


def use_model(monkeypatch: pytest.MonkeyPatch, replies: dict[bytes, str]) -> None:
    monkeypatch.setattr(model_drift, "load_model", lambda _name: RawModel(replies))


def gh_calls(monkeypatch: pytest.MonkeyPatch, open_issues: list[dict[str, Any]]) -> list[list[str]]:
    """Fake `gh api`: listing issues returns `open_issues`; every call is recorded."""
    calls: list[list[str]] = []

    def run(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        calls.append(command)
        listing = command[2].startswith("repos/{owner}/{repo}/issues?")
        stdout = json.dumps(open_issues) if listing else "{}"
        return subprocess.CompletedProcess(command, 0, stdout=stdout, stderr="")

    monkeypatch.setattr(subprocess, "run", run)
    return calls


def test_no_drift_while_the_model_gives_the_recorded_replies(
    recorded: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    use_model(monkeypatch, {b"cup": "a cup", b"sock": "a sock"})

    assert check("smolvlm") == []


def test_a_doctored_cassette_shows_up_as_drift(
    recorded: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = cassettes.path_for("smolvlm")
    cassette = json.loads(path.read_text())
    cassette["replies"]["cup.jpg"]["reply"] = "a hat"
    path.write_text(json.dumps(cassette))
    use_model(monkeypatch, {b"cup": "a cup", b"sock": "a sock"})

    assert check("smolvlm") == ["cup.jpg: 'a hat' -> 'a cup'"]


def test_report_lists_each_models_drift_and_the_run() -> None:
    body = report({"smolvlm": ["cup.jpg: 'a hat' -> 'a cup'"], "smolvlm-json": []}, RUN_URL)

    assert "- `smolvlm`: 1 reply drifted" in body
    assert "  - cup.jpg: 'a hat' -> 'a cup'" in body
    assert "- `smolvlm-json`: no drift" in body
    assert RUN_URL in body
    assert "scripts.cassettes record" in body


def test_files_a_new_issue_when_none_is_open(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = gh_calls(monkeypatch, [{"number": 5, "title": "Something else"}])

    file_issue("the report")

    assert calls[-1] == [
        "gh",
        "api",
        "repos/{owner}/{repo}/issues",
        "-f",
        f"title={TITLE}",
        "-f",
        "body=the report",
    ]


def test_updates_the_open_drift_issue_instead_of_filing_another(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = gh_calls(monkeypatch, [{"number": 9, "title": TITLE}])

    file_issue("the report")

    assert calls[-1] == [
        "gh",
        "api",
        "-X",
        "PATCH",
        "repos/{owner}/{repo}/issues/9",
        "-f",
        "body=the report",
    ]


def test_main_files_drift_and_still_passes(
    recorded: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    use_model(monkeypatch, {b"cup": "a mug", b"sock": "a sock"})
    calls = gh_calls(monkeypatch, [])
    summary = recorded / "summary.md"

    assert main(["smolvlm", "--summary", str(summary), "--run-url", RUN_URL]) == 0

    assert "cup.jpg: 'a cup' -> 'a mug'" in summary.read_text()
    assert calls[-1][2] == "repos/{owner}/{repo}/issues"
    assert "1 reply drifted" in capsys.readouterr().out


def test_main_files_nothing_without_drift(
    recorded: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    use_model(monkeypatch, {b"cup": "a cup", b"sock": "a sock"})
    calls = gh_calls(monkeypatch, [])
    summary = recorded / "summary.md"

    assert main(["smolvlm", "--summary", str(summary), "--run-url", RUN_URL]) == 0

    assert calls == []
    assert "`smolvlm`: no drift" in summary.read_text()
    assert "no drift" in capsys.readouterr().out
