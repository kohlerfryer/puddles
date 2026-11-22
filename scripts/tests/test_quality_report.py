import json
import subprocess
from pathlib import Path

import pytest

from scripts import quality_report
from scripts.quality_report import (
    CheckResult,
    Violation,
    parse_complexipy,
    parse_eslint,
    parse_game_lines,
    parse_lines,
    run_check,
    summary,
)


def test_parses_ruff_mypy_and_vulture_lines() -> None:
    output = "\n".join(
        [
            "server/app.py:1:5: too-many-arguments: Too many arguments (6 > 5)",
            "server/app.py:9: error: Missing return type  [no-untyped-def]",
            "Found 2 errors.",
        ]
    )

    assert parse_lines(output) == [
        Violation("server/app.py", 1, "too-many-arguments: Too many arguments (6 > 5)"),
        Violation("server/app.py", 9, "error: Missing return type  [no-untyped-def]"),
    ]


def test_parses_tsc_and_prettier_lines_under_game() -> None:
    output = "src/title.ts(3,5): error TS2322: bad type\n[warn] src/main.ts\n"

    assert parse_game_lines(output) == [
        Violation("game/src/title.ts", 3, "error TS2322: bad type"),
        Violation("game/src/main.ts", 1, "not formatted; run `just fix`"),
    ]


def test_parses_eslint_json(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)
    output = json.dumps(
        [
            {
                "filePath": f"{tmp_path}/game/src/x.ts",
                "messages": [{"line": 4, "ruleId": "max-params", "message": "Too many (5)."}],
            }
        ]
    )

    assert parse_eslint(output) == [Violation("game/src/x.ts", 4, "max-params: Too many (5).")]
    assert parse_eslint("not json") == []


def test_parses_complexipy_json(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    report = tmp_path / "complexipy.json"
    monkeypatch.setattr(quality_report, "COMPLEXIPY_JSON", report)
    assert parse_complexipy("") == []

    functions = [
        {"path": "a.py", "line_start": 3, "complexity": 16, "function_name": "busy"},
        {"path": "a.py", "line_start": 9, "complexity": 15, "function_name": "fine"},
    ]
    report.write_text(json.dumps(functions))

    assert parse_complexipy("") == [
        Violation("a.py", 3, "cognitive complexity 16 > 15 in busy"),
    ]


def fake_run(code: int, stdout: str) -> object:
    def run(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(command, code, stdout=stdout, stderr="")

    return run


def test_failing_check_keeps_violations(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(subprocess, "run", fake_run(1, "a.py:2: error: bad"))

    result = run_check("mypy", ["mypy"], parse_lines)

    assert result == CheckResult("mypy", False, [Violation("a.py", 2, "error: bad")], "")


def test_failing_check_without_locations_keeps_output(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(subprocess, "run", fake_run(1, "Coverage 80% < 85%"))

    result = run_check("pytest", ["pytest"], parse_lines)

    assert result.output_tail == "Coverage 80% < 85%"


def test_summary_lists_failures() -> None:
    results = [
        CheckResult("ruff", True),
        CheckResult("mypy", False, [Violation("a.py", 2, "error: bad")]),
        CheckResult("pytest", False, output_tail="Coverage 80% < 85%"),
    ]

    text = summary(results)

    assert "2 check(s) failed" in text
    assert "a.py:2: error: bad" in text
    assert "Coverage 80% < 85%" in text
    assert summary([CheckResult("ruff", True)]) == "All checks passed."


def test_main_writes_the_report(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(quality_report, "REPORT", tmp_path / ".quality" / "report.json")
    monkeypatch.setattr(subprocess, "run", fake_run(0, ""))

    assert quality_report.main() == 0
    report = json.loads((tmp_path / ".quality" / "report.json").read_text())
    assert report["passed"] is True
    assert len(report["checks"]) == len(quality_report.CHECKS)
