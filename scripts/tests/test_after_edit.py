import io
import json
import subprocess
from pathlib import Path

import pytest

from scripts.agent_hooks import after_edit
from scripts.agent_hooks.after_edit import check_edit, format_command, relative_source


@pytest.mark.parametrize(
    ("file_path", "expected"),
    [
        ("/repo/server/puddles_server/app.py", "server/puddles_server/app.py"),
        ("/repo/game/src/title.ts", "game/src/title.ts"),
        ("scripts/file_length.py", "scripts/file_length.py"),
        ("/repo/README.md", None),
        ("/elsewhere/app.py", None),
    ],
)
def test_only_checks_gated_sources(file_path: str, expected: str | None) -> None:
    assert relative_source(file_path, "/repo") == expected


def test_formats_with_the_matching_tool() -> None:
    assert format_command("server/x.py")[:3] == ["uv", "run", "ruff"]
    assert format_command("game/src/x.ts")[-1] == "src/x.ts"


def fake_run(returncode: int) -> object:
    def run(command: list[str]) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(
            command, returncode, stdout="x.py:1:1: E1 bad", stderr=""
        )

    return run


def edit_event(tmp_path: Path) -> dict[str, object]:
    (tmp_path / "x.py").write_text("x = 1\n")
    return {"cwd": str(tmp_path), "tool_input": {"file_path": str(tmp_path / "x.py")}}


def test_reports_violations(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(after_edit, "run", fake_run(1))

    report = check_edit(edit_event(tmp_path))

    assert report is not None
    assert "x.py:1:1: E1 bad" in report


def test_clean_edit_reports_nothing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(after_edit, "run", fake_run(0))

    assert check_edit(edit_event(tmp_path)) is None


def test_main_exits_2_with_report(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(after_edit, "run", fake_run(1))
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(edit_event(tmp_path))))

    assert after_edit.main() == 2


def test_main_ignores_non_source_files(monkeypatch: pytest.MonkeyPatch) -> None:
    event = {"cwd": "/repo", "tool_input": {"file_path": "/repo/README.md"}}
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(event)))

    assert after_edit.main() == 0
