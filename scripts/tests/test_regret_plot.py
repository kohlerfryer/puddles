import json
import subprocess
from pathlib import Path
from typing import Any

import pytest

from scripts import regret_plot
from scripts.regret_plot import Curve, main, parse_curves, plot, simulate, summary

CURVES: list[Curve] = [
    {"policy": "random", "profile": "loves-slapstick", "regret": [0.3, 0.7, 1.2]},
    {"policy": "fixed pratfall", "profile": "loves-slapstick", "regret": [0.0, 0.0, 0.5]},
    {"policy": "random", "profile": "copycat", "regret": [0.2, 0.4, 0.5]},
]


def test_parse_curves_reads_the_simulators_json() -> None:
    assert parse_curves(json.dumps(CURVES)) == CURVES


@pytest.mark.parametrize(
    "text",
    [
        "{}",
        '[{"policy": "random", "profile": "copycat"}]',
        '[{"policy": "random", "profile": "copycat", "regret": ["a"]}]',
        '[{"policy": 1, "profile": "copycat", "regret": []}]',
    ],
)
def test_parse_curves_refuses_anything_else(text: str) -> None:
    with pytest.raises(ValueError, match="regret curves"):
        parse_curves(text)


def test_plot_writes_a_png(tmp_path: Path) -> None:
    out = tmp_path / "regret.png"

    plot(CURVES, out)

    assert out.read_bytes().startswith(b"\x89PNG")


def test_summary_gives_each_curves_final_regret() -> None:
    assert summary(CURVES).splitlines() == [
        "kid              policy           regret",
        "loves-slapstick  random           1.20",
        "loves-slapstick  fixed pratfall   0.50",
        "copycat          random           0.50",
    ]


def test_simulate_builds_the_simulator_and_runs_it_in_node(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[list[str]] = []

    def run(command: list[str], **_: Any) -> subprocess.CompletedProcess[str]:
        calls.append(command)
        return subprocess.CompletedProcess(command, 0, stdout=json.dumps(CURVES))

    monkeypatch.setattr(subprocess, "run", run)

    assert simulate(sessions=4, horizon=3, seed=2) == CURVES
    build, node = calls
    assert build[:4] == ["pnpm", "-C", str(regret_plot.GAME), "exec"]
    assert "src/sim/simulator.ts" in build
    assert str(regret_plot.BUILD) in build
    assert node[0] == "node"
    assert json.loads(node[-1]) == {"sessions": 4, "horizon": 3, "seed": 2}


def test_simulate_says_why_the_build_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    def run(command: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        stderr = "Build broke" if kwargs.get("capture_output") else None
        raise subprocess.CalledProcessError(1, command, stderr=stderr)

    monkeypatch.setattr(subprocess, "run", run)

    with pytest.raises(subprocess.CalledProcessError) as error:
        simulate(sessions=4, horizon=3, seed=2)
    assert error.value.stderr == "Build broke"


def test_main_plots_and_prints_the_summary(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    asked: list[tuple[int, int, int]] = []

    def fake(sessions: int, horizon: int, seed: int) -> list[Curve]:
        asked.append((sessions, horizon, seed))
        return CURVES

    monkeypatch.setattr(regret_plot, "simulate", fake)
    out = tmp_path / "plot.png"

    assert main(["--sessions", "5", "--horizon", "3", "--out", str(out)]) == 0

    assert asked == [(5, 3, 1)]
    assert out.exists()
    printed = capsys.readouterr().out
    assert "loves-slapstick  random           1.20" in printed
    assert str(out) in printed


def test_simulate_runs_the_real_simulator() -> None:
    curves = simulate(sessions=1, horizon=3, seed=1)

    assert {curve["policy"] for curve in curves} == {
        "random",
        "fixed pratfall",
        "bandit beta",
        "bandit linear",
    }
    assert all(len(curve["regret"]) == 3 for curve in curves)
