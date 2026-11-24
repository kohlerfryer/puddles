import json
import subprocess
from pathlib import Path
from typing import Any, cast

import pytest

from scripts import sim_thresholds
from scripts.sim_thresholds import (
    GateCurve,
    Thresholds,
    failures,
    load_thresholds,
    main,
    parse_results,
    summary,
)

THRESHOLDS: Thresholds = {
    "sessions": 4,
    "horizon": 4,
    "seed": 1,
    "regret_tolerance": 0.5,
    "max_over_budget_share": 0.05,
    "timeout_s": 60,
    "baseline": {"random": {"copycat": 1.0}},
}


def curve(**changes: Any) -> GateCurve:
    healthy: GateCurve = {
        "policy": "random",
        "profile": "copycat",
        "regret": [0.2, 0.5, 0.9, 1.2],
        "smiles_per_bit": 0.25,
        "crashes": [],
        "hangs": 0,
        "unsafe": [],
        "over_budget_share": 0.0,
    }
    return cast(GateCurve, {**healthy, **changes})


@pytest.fixture
def thresholds_file(tmp_path: Path) -> Path:
    path = tmp_path / "thresholds.json"
    path.write_text(json.dumps(THRESHOLDS))
    return path


def test_load_thresholds_reads_the_file(thresholds_file: Path) -> None:
    assert load_thresholds(thresholds_file) == THRESHOLDS


@pytest.mark.parametrize(
    "changes",
    [{"sessions": "many"}, {"regret_tolerance": None}, {"baseline": {"random": {"copycat": "x"}}}],
)
def test_load_thresholds_refuses_a_broken_file(tmp_path: Path, changes: dict[str, Any]) -> None:
    path = tmp_path / "thresholds.json"
    path.write_text(json.dumps({**THRESHOLDS, **changes}))

    with pytest.raises(ValueError, match="thresholds"):
        load_thresholds(path)


def test_parse_results_reads_the_gates_json() -> None:
    assert parse_results(json.dumps([curve()])) == [curve()]


@pytest.mark.parametrize("text", ["{}", "[{}]", json.dumps([curve(hangs="none")])])
def test_parse_results_refuses_anything_else(text: str) -> None:
    with pytest.raises(ValueError, match="gate results"):
        parse_results(text)


def test_a_healthy_run_passes() -> None:
    assert failures([curve(), curve(policy="bandit")], THRESHOLDS) == []


@pytest.mark.parametrize(
    ("changes", "expected"),
    [
        (
            {"crashes": ["threw at t=6033: Error: oops"]},
            "random on copycat: crash: threw at t=6033: Error: oops",
        ),
        ({"hangs": 2}, "random on copycat: hang: 2 sessions never finished"),
        (
            {"unsafe": ['blocklist: blocked "climb"']},
            'random on copycat: unsafe: blocklist: blocked "climb"',
        ),
        (
            {"regret": [0.5, 1.0, 1.5, 1.6]},
            "random on copycat: regret: 1.60 is worse than the baseline 1.00 + 0.50",
        ),
        (
            {"over_budget_share": 0.1},
            "random on copycat: budget: over time budget on 10.0% of ticks (limit 5.0%)",
        ),
    ],
)
def test_each_problem_fails_the_gate(changes: dict[str, Any], expected: str) -> None:
    assert failures([curve(**changes)], THRESHOLDS) == [expected]


def test_regret_within_the_tolerance_passes() -> None:
    assert failures([curve(regret=[0.5, 1.0, 1.4, 1.5])], THRESHOLDS) == []


def test_summary_shows_regret_curves_smiles_per_bit_and_failures() -> None:
    text = summary([curve()], ["random on copycat: hang: 1 sessions never finished"], THRESHOLDS)

    assert text.startswith("## Simulation gate: failed\n")
    assert "4 sessions per policy and kid, 4 bits each, seed 1" in text
    assert "| copycat | random | 0.20 | 0.50 | 1.20 | 1.00 | 0.25 |" in text
    assert "- random on copycat: hang: 1 sessions never finished" in text


def test_summary_says_when_the_gate_passes() -> None:
    assert summary([curve()], [], THRESHOLDS).startswith("## Simulation gate: passed\n")


def fake_simulator(
    monkeypatch: pytest.MonkeyPatch, result: list[GateCurve] | Exception
) -> list[tuple[str, str, dict[str, int], float | None]]:
    calls: list[tuple[str, str, dict[str, int], float | None]] = []

    def run(
        module: str, function: str, options: dict[str, int], timeout: float | None = None
    ) -> str:
        calls.append((module, function, options, timeout))
        if isinstance(result, Exception):
            raise result
        return json.dumps(result)

    monkeypatch.setattr(sim_thresholds, "run_simulator", run)
    return calls


def test_main_runs_the_gate_and_writes_the_summary(
    monkeypatch: pytest.MonkeyPatch, thresholds_file: Path, tmp_path: Path
) -> None:
    calls = fake_simulator(monkeypatch, [curve()])
    out = tmp_path / "summary.md"

    assert main([str(thresholds_file), "--summary", str(out)]) == 0

    assert calls == [("gate", "simulationGate", {"sessions": 4, "horizon": 4, "seed": 1}, 60)]
    assert out.read_text().startswith("## Simulation gate: passed")


def test_main_fails_on_an_unsafe_intent(
    monkeypatch: pytest.MonkeyPatch,
    thresholds_file: Path,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    fake_simulator(monkeypatch, [curve(unsafe=['blocklist: blocked "climb"'])])

    assert main([str(thresholds_file), "--summary", str(tmp_path / "s.md")]) == 1

    assert 'unsafe: blocklist: blocked "climb"' in capsys.readouterr().out


def test_main_fails_when_the_simulation_hangs(
    monkeypatch: pytest.MonkeyPatch, thresholds_file: Path, tmp_path: Path
) -> None:
    fake_simulator(monkeypatch, subprocess.TimeoutExpired("node", 60))
    out = tmp_path / "summary.md"

    assert main([str(thresholds_file), "--summary", str(out)]) == 1

    assert "- hang: the simulation ran past 60 s" in out.read_text()


def test_main_fails_when_the_simulator_crashes(
    monkeypatch: pytest.MonkeyPatch, thresholds_file: Path, tmp_path: Path
) -> None:
    fake_simulator(monkeypatch, subprocess.CalledProcessError(1, "node", stderr="Boom"))
    out = tmp_path / "summary.md"

    assert main([str(thresholds_file), "--summary", str(out)]) == 1

    assert "- crash: the simulator exited with 1: Boom" in out.read_text()


def test_the_real_gate_passes_its_own_baseline(tmp_path: Path) -> None:
    path = tmp_path / "thresholds.json"
    path.write_text(json.dumps({**THRESHOLDS, "sessions": 2, "baseline": {}}))

    assert main([str(path), "--summary", str(tmp_path / "summary.md")]) == 0
