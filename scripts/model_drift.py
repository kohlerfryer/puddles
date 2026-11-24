"""Nightly check that the real models still give the replies in their cassettes (spec §14.1).

Runs each model on `ml/bench/photos`, writes a Markdown report and, when any reply drifted, opens
one issue or updates the open one. Drift never fails the job, so it can't turn `main` red.

    PYTHONPATH=server uv run --group vlm python -m scripts.model_drift --summary drift.md
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

from puddles_server.models import load_model
from scripts import cassettes

MODELS = ("smolvlm", "smolvlm-json")
TITLE = "Model drift: real model replies no longer match the cassettes"


def check(name: str) -> list[str]:
    """A line for each bench photo whose real reply differs from the model's cassette."""
    recorded = json.loads(cassettes.path_for(name).read_text())
    return cassettes.drift(recorded, cassettes.record(load_model(name), cassettes.PHOTOS))


def plural(count: int) -> str:
    return "1 reply" if count == 1 else f"{count} replies"


def report(results: dict[str, list[str]], run_url: str) -> str:
    lines = ["Real models against their recorded replies on `ml/bench/photos`:", ""]
    for name, changed in results.items():
        lines.append(f"- `{name}`: {plural(len(changed)) + ' drifted' if changed else 'no drift'}")
        lines.extend(f"  - {line}" for line in changed)
    lines += [
        "",
        f"Run: {run_url}",
        "",
        "If the new replies are right, re-record with "
        "`PYTHONPATH=server uv run --group vlm python -m scripts.cassettes record <model>`; "
        "otherwise find what changed the model.",
    ]
    return "\n".join(lines) + "\n"


def gh(*args: str) -> str:
    return subprocess.run(["gh", "api", *args], capture_output=True, text=True, check=True).stdout


def file_issue(body: str) -> None:
    """Update the open drift issue, or open one when there is none."""
    issues = json.loads(gh("repos/{owner}/{repo}/issues?state=open&per_page=100"))
    existing = [issue["number"] for issue in issues if issue["title"] == TITLE]
    if existing:
        gh("-X", "PATCH", f"repos/{{owner}}/{{repo}}/issues/{existing[0]}", "-f", f"body={body}")
    else:
        gh("repos/{owner}/{repo}/issues", "-f", f"title={TITLE}", "-f", f"body={body}")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("models", nargs="*", default=list(MODELS))
    parser.add_argument("--summary", type=Path, required=True)
    parser.add_argument("--run-url", default="local run")
    args = parser.parse_args(argv)
    results = {name: check(name) for name in args.models}
    body = report(results, args.run_url)
    args.summary.write_text(body)
    print(body)
    if any(results.values()):
        file_issue(body)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
