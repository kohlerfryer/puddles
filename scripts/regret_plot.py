"""Plot regret curves from the headless simulator: one panel per simulated kid, a line per policy.

Builds the simulator (`game/src/sim/`) with Vite, runs it in Node, writes the plot and prints
each curve's final regret:

    uv run python -m scripts.regret_plot --sessions 100 --out regret.png
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import TypedDict, TypeGuard

from matplotlib.figure import Figure

GAME = Path(__file__).resolve().parents[1] / "game"
# Inside game/node_modules so Node finds the simulator's dependencies from the build.
BUILD = GAME / "node_modules" / ".cache" / "puddles-sim"
RUN = """
const [path, name, options] = process.argv.slice(1);
const module = await import(path);
console.log(JSON.stringify(module[name](JSON.parse(options))));
"""


class Curve(TypedDict):
    policy: str
    profile: str
    regret: list[float]


def is_curve(value: object) -> TypeGuard[Curve]:
    if not isinstance(value, dict):
        return False
    regret = value.get("regret")
    return (
        isinstance(value.get("policy"), str)
        and isinstance(value.get("profile"), str)
        and isinstance(regret, list)
        and all(isinstance(r, int | float) for r in regret)
    )


def parse_curves(text: str) -> list[Curve]:
    curves: object = json.loads(text)
    if not isinstance(curves, list) or not all(is_curve(curve) for curve in curves):
        raise ValueError(f"expected a list of regret curves, got {text[:200]}")
    return [curve for curve in curves if is_curve(curve)]


def run_simulator(
    module: str, function: str, options: dict[str, int], timeout: float | None = None
) -> str:
    """Builds `game/src/sim/<module>.ts` and returns `function(options)` as JSON text."""
    build = ["vite", "build", "--ssr", f"src/sim/{module}.ts", "--outDir", str(BUILD)]
    subprocess.run(
        ["pnpm", "-C", str(GAME), "exec", *build, "--emptyOutDir", "--logLevel", "warn"],
        check=True,
    )
    path = (BUILD / f"{module}.js").as_uri()
    result = subprocess.run(
        ["node", "--input-type=module", "-e", RUN, path, function, json.dumps(options)],
        check=True,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return result.stdout


def simulate(sessions: int, horizon: int, seed: int) -> list[Curve]:
    """Mean cumulative regret per bit for each policy and simulated kid."""
    options = {"sessions": sessions, "horizon": horizon, "seed": seed}
    return parse_curves(run_simulator("simulator", "regretCurves", options))


def plot(curves: list[Curve], out: Path) -> None:
    kids = list(dict.fromkeys(curve["profile"] for curve in curves))
    fig = Figure(figsize=(4 * len(kids), 3.5), layout="tight")
    axes = fig.subplots(1, len(kids), sharey=True, squeeze=False)
    for ax, kid in zip(axes[0], kids, strict=True):
        for curve in (c for c in curves if c["profile"] == kid):
            ax.plot(range(1, len(curve["regret"]) + 1), curve["regret"], label=curve["policy"])
        ax.set_title(kid)
        ax.set_xlabel("bits played")
    axes[0][0].set_ylabel("cumulative regret (smiles)")
    axes[0][0].legend()
    fig.savefig(out)


def summary(curves: list[Curve]) -> str:
    rows = [("kid", "policy", "regret")]
    rows += [(c["profile"], c["policy"], f"{c['regret'][-1]:.2f}") for c in curves]
    return "\n".join(f"{kid:<16} {policy:<16} {regret}" for kid, policy, regret in rows)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--sessions", type=int, default=100, help="sessions per policy and kid")
    parser.add_argument("--horizon", type=int, default=20, help="bits per session")
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--out", type=Path, default=Path("regret.png"))
    args = parser.parse_args(argv)
    curves = simulate(args.sessions, args.horizon, args.seed)
    plot(curves, args.out)
    print(summary(curves))
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
