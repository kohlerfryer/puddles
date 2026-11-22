import subprocess

import pytest

from scripts import git_changes
from scripts.git_changes import FileChange, added_lines, branch_changes, is_test, parse_changes


def test_identifies_tests() -> None:
    assert is_test("server/tests/test_app.py")
    assert is_test("game/src/title.test.ts")
    assert not is_test("server/puddles_server/app.py")


def test_parses_name_status_and_numstat() -> None:
    name_status = "M\tserver/app.py\nD\tserver/tests/test_old.py\nR100\told.py\tnew.py\n"
    numstat = "3\t1\tserver/app.py\n0\t9\tserver/tests/test_old.py\n-\t-\timage.png\n"

    assert parse_changes(name_status, numstat) == [
        FileChange("server/app.py", "M", 3, 1),
        FileChange("server/tests/test_old.py", "D", 0, 9),
        FileChange("image.png", "M", 0, 0),
    ]


def test_extracts_added_lines() -> None:
    diff = "+++ b/app.py\n@@ -1 +1 @@\n-old\n+new line\n context\n"

    assert added_lines(diff) == ["new line"]


def test_branch_changes_reads_git(monkeypatch: pytest.MonkeyPatch) -> None:
    outputs = {
        "--name-status": "A\tserver/app.py\n",
        "--numstat": "2\t0\tserver/app.py\n",
        "-U0": "+++ b/server/app.py\n+x = 1\n+y = 2\n",
    }

    def run(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(command, 0, stdout=outputs[command[2]], stderr="")

    monkeypatch.setattr(subprocess, "run", run)

    changes, added = branch_changes("origin/main")

    assert changes == [FileChange("server/app.py", "A", 2, 0)]
    assert added == ["x = 1", "y = 2"]
    assert git_changes.git("diff", "--numstat") == "2\t0\tserver/app.py\n"
