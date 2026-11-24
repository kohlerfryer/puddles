"""Scaffold a plugin folder that already passes the plugin harness: `puddles new <kind> <id>`.

Writes `game/src/plugins/<kind>/<id>/` with a manifest, the code its kind needs, and a test
that runs the harness on it (docs/spec/m3-kernel.md §5 and §14).
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).parents[1]
PLUGINS = ROOT / "game" / "src" / "plugins"
ID = re.compile(r"^[a-z][a-z0-9_-]*$")
KERNEL = "../../../kernel"

FIELDS: dict[str, dict[str, Any]] = {
    "sense": {"inputs": ["camera"], "budget_ms": 2},
    "brain": {
        "cadence": {"every_s": 1},
        "autonomy": 1,
        "latency_budget_ms": 5,
        "intents": ["routine"],
    },
    "skill": {"params": {}, "needs": [], "duration_s": 1, "energy": 0, "outcomes": ["done"]},
    "content": {"type": "prop"},
}

CODE = {
    "sense": "sense: () => [],",
    "brain": "decide: () => null,",
    "skill": 'start: () => ({ tick: () => ({ status: "done" }) }),',
}

INDEX = """import type {{ PluginCode }} from "{kernel}/plugins";

export const code: PluginCode = {{
  {body}
}};
"""

TEST = """import {{ describe, expect, it }} from "vitest";

import {{ checkPlugin }} from "{kernel}/harness";
{imports}import manifest from "./manifest.json";

describe("{id}", () => {{
  it("passes the plugin harness", () => {{
    expect(checkPlugin(() => ({{ {folder} }}))).toEqual([]);
  }});
}});
"""


def manifest(kind: str, plugin_id: str) -> dict[str, Any]:
    fields = dict(FIELDS[kind])
    if kind == "sense":
        fields["emits"] = [f"observation.{plugin_id.replace('-', '_')}"]
    return {
        "kind": kind,
        "id": plugin_id,
        "contract": "1",
        "name": plugin_id.replace("-", " ").replace("_", " ").capitalize(),
        "authors": ["Puddles"],
        "license": "MIT",
        "tags": [],
        **fields,
    }


def pretty(value: dict[str, Any]) -> str:
    """JSON as prettier formats it: objects one key per line, arrays on one line."""
    lines = [
        f"  {json.dumps(key)}: {json.dumps(item, indent=2 if isinstance(item, dict) else None)}"
        for key, item in value.items()
    ]
    return "{\n" + ",\n".join(line.replace("\n", "\n  ") for line in lines) + "\n}\n"


def scaffold(kind: str, plugin_id: str, plugins: Path = PLUGINS) -> Path:
    """Write a new plugin folder and return it; refuses to touch an existing one."""
    if not ID.match(plugin_id):
        raise ValueError(f"{plugin_id!r} is not a plugin id: use {ID.pattern}")
    folder = plugins / kind / plugin_id
    if folder.exists():
        raise FileExistsError(f"{folder} already exists")
    folder.mkdir(parents=True)
    (folder / "manifest.json").write_text(pretty(manifest(kind, plugin_id)))
    has_code = kind in CODE
    if has_code:
        (folder / "index.ts").write_text(INDEX.format(kernel=KERNEL, body=CODE[kind]))
    test = TEST.format(
        kernel=KERNEL,
        id=plugin_id,
        imports='import { code } from "./index";\n' if has_code else "",
        folder="manifest, code" if has_code else "manifest",
    )
    (folder / f"{plugin_id}.test.ts").write_text(test)
    return folder


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="puddles new", description=__doc__)
    parser.add_argument("kind", choices=list(FIELDS))
    parser.add_argument("id")
    parser.add_argument("--root", type=Path, default=PLUGINS, help="plugins folder")
    args = parser.parse_args(argv)
    try:
        folder = scaffold(args.kind, args.id, args.root)
    except (ValueError, FileExistsError) as error:
        print(f"puddles new: {error}", file=sys.stderr)
        return 1
    print(f"created {folder}; run: pnpm -C game exec vitest run {folder}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
