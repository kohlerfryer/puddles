"""Run every gate and write .quality/report.json with one entry per violation.

Each violation has a file, a line and a message that names the rule and limit, so an
agent can fix failures without rereading tool output. Checks whose tools don't print
locations (tests, duplication, knip) fall back to the tail of their output.
"""

import json
import re
import subprocess
import sys
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from pathlib import Path

from scripts.agent_hooks.hook_io import tail

REPORT = Path(".quality/report.json")
COMPLEXIPY_JSON = Path(".quality/complexipy.json")
MAX_COGNITIVE = 15

LOCATED = re.compile(r"^(?P<file>[\w./-]+\.(?:py|ts|js)):(?P<line>\d+)(?::\d+)?:\s*(?P<msg>.+)$")
TSC = re.compile(r"^(?P<file>[\w./-]+\.ts)\((?P<line>\d+),\d+\):\s*(?P<msg>.+)$")
REFORMAT = re.compile(r"^(?:Would reformat:|\[warn\])\s+(?P<file>[\w./-]+\.(?:py|ts|js))$")


@dataclass
class Violation:
    file: str
    line: int
    message: str


@dataclass
class CheckResult:
    name: str
    passed: bool
    violations: list[Violation] = field(default_factory=list)
    output_tail: str = ""


Parser = Callable[[str], list[Violation]]


def parse_lines(output: str, prefix: str = "") -> list[Violation]:
    """Parse `file:line: msg`, `file(line,col): msg` and "would reformat" lines."""
    violations = []
    for raw in output.splitlines():
        line = raw.strip()
        if match := LOCATED.match(line) or TSC.match(line):
            file, number, msg = match["file"], int(match["line"]), match["msg"]
        elif match := REFORMAT.match(line):
            file, number, msg = match["file"], 1, "not formatted; run `just fix`"
        else:
            continue
        violations.append(Violation(prefix + file, number, msg))
    return violations


def parse_game_lines(output: str) -> list[Violation]:
    return parse_lines(output, prefix="game/")


def parse_eslint(output: str) -> list[Violation]:
    try:
        files = json.loads(output)
    except json.JSONDecodeError:
        return []
    root = str(Path.cwd()) + "/"
    return [
        Violation(f["filePath"].removeprefix(root), m["line"], f"{m['ruleId']}: {m['message']}")
        for f in files
        for m in f["messages"]
    ]


def parse_complexipy(_output: str) -> list[Violation]:
    if not COMPLEXIPY_JSON.exists():
        return []
    functions = json.loads(COMPLEXIPY_JSON.read_text())
    return [
        Violation(
            fn["path"],
            fn["line_start"],
            f"cognitive complexity {fn['complexity']} > {MAX_COGNITIVE} in {fn['function_name']}",
        )
        for fn in functions
        if fn["complexity"] > MAX_COGNITIVE
    ]


def no_locations(_output: str) -> list[Violation]:
    return []


GAME = ["pnpm", "-C", "game", "exec"]
CHECKS: list[tuple[str, list[str], Parser]] = [
    ("ruff format", ["uv", "run", "ruff", "format", "--check", "."], parse_lines),
    ("ruff", ["uv", "run", "ruff", "check", ".", "--output-format", "concise"], parse_lines),
    ("mypy", ["uv", "run", "mypy"], parse_lines),
    (
        "complexipy",
        [
            "uv",
            "run",
            "complexipy",
            "-q",
            "--output-format",
            "json",
            "--output",
            str(COMPLEXIPY_JSON),
        ],
        parse_complexipy,
    ),
    ("file length", ["uv", "run", "python", "-m", "scripts.file_length"], parse_lines),
    ("vulture", ["uv", "run", "vulture"], parse_lines),
    ("pytest", ["uv", "run", "pytest", "-q", "--cov"], no_locations),
    ("prettier", [*GAME, "prettier", "--check", "."], parse_game_lines),
    ("eslint", [*GAME, "eslint", ".", "--max-warnings", "0", "-f", "json"], parse_eslint),
    ("tsc", [*GAME, "tsc", "--noEmit", "--pretty", "false"], parse_game_lines),
    ("knip", [*GAME, "knip"], no_locations),
    ("vitest", [*GAME, "vitest", "run", "--coverage"], no_locations),
    ("jscpd", ["game/node_modules/.bin/jscpd", "--config", ".jscpd.json"], no_locations),
]


def run_check(name: str, command: list[str], parser: Parser) -> CheckResult:
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    output = result.stdout + result.stderr
    passed = result.returncode == 0
    violations = [] if passed else parser(result.stdout)
    return CheckResult(name, passed, violations, "" if passed or violations else tail(output))


def summary(results: list[CheckResult]) -> str:
    failed = [r for r in results if not r.passed]
    if not failed:
        return "All checks passed."
    lines = [f"{len(failed)} check(s) failed:"]
    for check in failed:
        lines.append(f"\n## {check.name}")
        lines += [f"{v.file}:{v.line}: {v.message}" for v in check.violations]
        if check.output_tail:
            lines.append(check.output_tail)
    return "\n".join(lines)


def main() -> int:
    REPORT.parent.mkdir(exist_ok=True)
    results = [run_check(*check) for check in CHECKS]
    passed = all(r.passed for r in results)
    REPORT.write_text(json.dumps({"passed": passed, "checks": [asdict(r) for r in results]}))
    print(summary(results))
    print(f"\nFull report: {REPORT}")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
