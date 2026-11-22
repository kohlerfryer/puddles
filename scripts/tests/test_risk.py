import json
from pathlib import Path

import pytest

from scripts import risk
from scripts.git_changes import FileChange
from scripts.risk import assess, is_owned, owned_paths

CODEOWNERS = """# High-risk paths
/.github/              @owner
/pyproject.toml        @owner
"""
PATTERNS = owned_paths(CODEOWNERS)


def change(path: str, status: str = "M", added: int = 5, deleted: int = 0) -> FileChange:
    return FileChange(path, status, added, deleted)


def test_reads_codeowners_patterns() -> None:
    assert PATTERNS == [".github/", "pyproject.toml"]


def test_matches_directories_by_prefix_and_files_exactly() -> None:
    assert is_owned(".github/workflows/ci.yml", PATTERNS)
    assert is_owned("pyproject.toml", PATTERNS)
    assert not is_owned("server/pyproject.toml", PATTERNS)


def test_plain_source_change_is_low_risk() -> None:
    result = assess([change("server/app.py")], ["x = 1"], PATTERNS, [])

    assert result.level == "low"
    assert result.reasons == []


@pytest.mark.parametrize(
    ("changes", "added", "labels", "reason"),
    [
        ([change(".github/workflows/ci.yml")], [], [], "high-risk paths"),
        ([change("server/app.py", added=300, deleted=150)], [], [], "450 non-test lines"),
        ([change("server/tests/test_app.py", status="D", added=0)], [], [], "deletes tests"),
        ([change("server/app.py")], ["x = f()  # noqa: E501"], [], "suppression"),
        ([change("game/src/a.ts")], ["// eslint-disable-next-line max-params"], [], "suppression"),
        ([change("server/app.py")], [], ["risk:high"], "already labeled"),
    ],
)
def test_high_risk_reasons(
    changes: list[FileChange], added: list[str], labels: list[str], reason: str
) -> None:
    result = assess(changes, added, PATTERNS, labels)

    assert result.level == "high"
    assert any(reason in r for r in result.reasons)


def test_lockfiles_do_not_count_toward_size() -> None:
    changes = [change("uv.lock", added=900), change("server/app.py", added=10)]

    assert assess(changes, [], [], []).level == "low"


def test_main_prints_json(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    (tmp_path / ".github").mkdir()
    (tmp_path / ".github" / "CODEOWNERS").write_text(CODEOWNERS)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(risk, "branch_changes", lambda _base: ([change(".github/x.yml")], []))

    assert risk.main(["--labels", "agent-authored"]) == 0
    assert json.loads(capsys.readouterr().out)["level"] == "high"


def test_test_lines_do_not_count_toward_size() -> None:
    changes = [change("game/src/core/verbs.test.ts", added=300), change("server/app.py", added=200)]

    assert assess(changes, [], [], []).level == "low"
