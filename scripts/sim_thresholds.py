"""Run the simulation gate and check it against a thresholds file (spec §14.1).

Every policy plays simulated-kid sessions in the headless kernel (`game/src/sim/gate.ts`). The
gate fails on crashes or hangs, intents the guardian's rules reject, regret worse than the
baseline beyond a tolerance, or plugins over their time budgets. Writes a Markdown summary with
regret curves and smiles per bit, and exits 1 on any failure:

    uv run python -m scripts.sim_thresholds thresholds.json --summary sim-summary.md
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import TypedDict, TypeGuard

from scripts.regret_plot import Curve, is_curve, run_simulator


class Thresholds(TypedDict):
    sessions: int
    horizon: int
    seed: int
    regret_tolerance: float
    max_over_budget_share: float
    timeout_s: float
    # Final mean regret per policy, then simulated kid; curves without one aren't compared.
    baseline: dict[str, dict[str, float]]


class GateCurve(Curve):
    smiles_per_bit: float
    crashes: list[str]
    hangs: int
    unsafe: list[str]
    over_budget_share: float


def is_number(value: object) -> TypeGuard[float]:
    return isinstance(value, int | float) and not isinstance(value, bool)


def is_strings(value: object) -> TypeGuard[list[str]]:
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def is_baseline(value: object) -> TypeGuard[dict[str, dict[str, float]]]:
    return isinstance(value, dict) and all(
        isinstance(kids, dict) and all(is_number(regret) for regret in kids.values())
        for kids in value.values()
    )


def is_thresholds(value: object) -> TypeGuard[Thresholds]:
    if not isinstance(value, dict):
        return False
    counts = ("sessions", "horizon", "seed")
    limits = ("regret_tolerance", "max_over_budget_share", "timeout_s")
    return (
        all(isinstance(value.get(key), int) for key in counts)
        and all(is_number(value.get(key)) for key in limits)
        and is_baseline(value.get("baseline"))
    )


def load_thresholds(path: Path) -> Thresholds:
    thresholds: object = json.loads(path.read_text())
    if not is_thresholds(thresholds):
        raise ValueError(f"{path} is not a thresholds file: see Thresholds in {__name__}")
    return thresholds


def is_gate_curve(value: object) -> TypeGuard[GateCurve]:
    return (
        is_curve(value)
        and isinstance(value, dict)
        and is_number(value.get("smiles_per_bit"))
        and is_strings(value.get("crashes"))
        and isinstance(value.get("hangs"), int)
        and is_strings(value.get("unsafe"))
        and is_number(value.get("over_budget_share"))
    )


def parse_results(text: str) -> list[GateCurve]:
    curves: object = json.loads(text)
    if not isinstance(curves, list) or not all(is_gate_curve(curve) for curve in curves):
        raise ValueError(f"expected a list of gate results, got {text[:200]}")
    return [curve for curve in curves if is_gate_curve(curve)]


def regret_failure(curve: GateCurve, thresholds: Thresholds) -> list[str]:
    baseline = thresholds["baseline"].get(curve["policy"], {}).get(curve["profile"])
    final = curve["regret"][-1] if curve["regret"] else 0.0
    tolerance = thresholds["regret_tolerance"]
    if baseline is None or final <= baseline + tolerance:
        return []
    return [f"regret: {final:.2f} is worse than the baseline {baseline:.2f} + {tolerance:.2f}"]


def curve_failures(curve: GateCurve, thresholds: Thresholds) -> list[str]:
    share, limit = curve["over_budget_share"], thresholds["max_over_budget_share"]
    over = f"budget: over time budget on {share:.1%} of ticks (limit {limit:.1%})"
    return [
        *(f"crash: {crash}" for crash in curve["crashes"]),
        *([f"hang: {curve['hangs']} sessions never finished"] if curve["hangs"] else []),
        *(f"unsafe: {reason}" for reason in curve["unsafe"]),
        *regret_failure(curve, thresholds),
        *([over] if share > limit else []),
    ]


def failures(curves: list[GateCurve], thresholds: Thresholds) -> list[str]:
    """Every reason the gate fails, each naming the policy and simulated kid."""
    return [
        f"{curve['policy']} on {curve['profile']}: {failure}"
        for curve in curves
        for failure in curve_failures(curve, thresholds)
    ]


def regret_at(curve: GateCurve, bit: int) -> str:
    regret = curve["regret"]
    return f"{regret[min(bit, len(regret)) - 1]:.2f}" if regret else "-"


def row(curve: GateCurve, bits: list[int], thresholds: Thresholds) -> list[str]:
    baseline = thresholds["baseline"].get(curve["policy"], {}).get(curve["profile"])
    return [
        curve["profile"],
        curve["policy"],
        *(regret_at(curve, bit) for bit in bits),
        "-" if baseline is None else f"{baseline:.2f}",
        f"{curve['smiles_per_bit']:.2f}",
    ]


def summary(curves: list[GateCurve], failed: list[str], thresholds: Thresholds) -> str:
    """The gate's result as Markdown: regret after a quarter, half and all of the bits."""
    horizon = thresholds["horizon"]
    bits = [max(1, horizon // 4), max(1, horizon // 2), horizon]
    header = ["kid", "policy", *(f"regret @{bit}" for bit in bits), "baseline", "smiles/bit"]
    rows = [row(curve, bits, thresholds) for curve in curves]
    lines = [
        f"## Simulation gate: {'failed' if failed else 'passed'}",
        "",
        f"{thresholds['sessions']} sessions per policy and kid, {horizon} bits each, "
        f"seed {thresholds['seed']}. Regret is cumulative, in smiles.",
        "",
        *("| " + " | ".join(row) + " |" for row in [header, ["---"] * len(header), *rows]),
    ]
    if failed:
        lines += ["", "### Failures", "", *(f"- {failure}" for failure in failed)]
    return "\n".join(lines) + "\n"


def run_gate(thresholds: Thresholds) -> tuple[list[GateCurve], list[str]]:
    """The gate's curves and failures; a simulator that crashes or hangs fails it outright."""
    options = {key: thresholds[key] for key in ("sessions", "horizon", "seed")}
    timeout = thresholds["timeout_s"]
    try:
        curves = parse_results(run_simulator("gate", "simulationGate", options, timeout))
    except subprocess.TimeoutExpired:
        return [], [f"hang: the simulation ran past {timeout:g} s"]
    except subprocess.CalledProcessError as error:
        return [], [f"crash: the simulator exited with {error.returncode}: {error.stderr}"]
    return curves, failures(curves, thresholds)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("thresholds", type=Path, help="JSON file of sessions and limits")
    parser.add_argument("--summary", type=Path, default=Path("sim-summary.md"))
    args = parser.parse_args(argv)
    thresholds = load_thresholds(args.thresholds)
    curves, failed = run_gate(thresholds)
    args.summary.write_text(summary(curves, failed, thresholds))
    print("\n".join(failed) if failed else "simulation gate passed")
    print(f"wrote {args.summary}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
