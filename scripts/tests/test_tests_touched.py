import pytest

from scripts import tests_touched
from scripts.git_changes import FileChange
from scripts.tests_touched import is_source, untested_sources


def change(path: str, status: str = "M") -> FileChange:
    return FileChange(path, status, 1, 0)


def test_recognizes_source_files() -> None:
    assert is_source("server/puddles_server/app.py")
    assert is_source("game/src/title.ts")
    assert not is_source("game/src/title.test.ts")
    assert not is_source("server/puddles_server/__init__.py")
    assert not is_source("docs/workflow.md")
    assert not is_source("game/src/render/pond.ts")
    assert not is_source("game/src/main.ts")


def test_flags_source_changes_without_tests() -> None:
    changes = [change("server/puddles_server/app.py"), change("docs/workflow.md")]

    assert untested_sources(changes) == ["server/puddles_server/app.py"]


def test_passes_when_a_test_changed() -> None:
    changes = [change("game/src/title.ts"), change("game/src/title.test.ts")]

    assert untested_sources(changes) == []


def test_ignores_deleted_sources() -> None:
    assert untested_sources([change("server/puddles_server/old.py", status="D")]) == []


def test_main_fails_on_untested_source(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(
        tests_touched, "branch_changes", lambda _base: ([change("scripts/risk.py")], [])
    )

    assert tests_touched.main([]) == 1
    assert "scripts/risk.py:1" in capsys.readouterr().out


def test_main_passes_docs_only(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tests_touched, "branch_changes", lambda _base: ([change("README.md")], []))

    assert tests_touched.main([]) == 0
