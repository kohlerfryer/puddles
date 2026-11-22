from pathlib import Path

import pytest

from scripts.file_length import main, python_files, too_long


def write_lines(path: Path, count: int) -> Path:
    path.write_text("x = 1\n" * count)
    return path


def test_flags_only_files_over_the_limit(tmp_path: Path) -> None:
    short = write_lines(tmp_path / "short.py", 3)
    long = write_lines(tmp_path / "long.py", 4)

    assert too_long([short, long], limit=3) == [(long, 4)]


def test_finds_python_files_under_roots(tmp_path: Path) -> None:
    (tmp_path / "pkg").mkdir()
    module = write_lines(tmp_path / "pkg" / "mod.py", 1)
    (tmp_path / "pkg" / "notes.txt").write_text("not python")

    assert python_files((str(tmp_path / "pkg"),)) == [module]


def test_main_reports_offenders(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (tmp_path / "server").mkdir()
    write_lines(tmp_path / "server" / "big.py", 301)
    monkeypatch.chdir(tmp_path)

    assert main() == 1


def test_main_passes_clean_tree(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (tmp_path / "server").mkdir()
    write_lines(tmp_path / "server" / "ok.py", 10)
    monkeypatch.chdir(tmp_path)

    assert main() == 0
