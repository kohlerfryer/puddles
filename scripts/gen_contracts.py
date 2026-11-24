"""Generate the server's TypedDicts from the JSON Schemas in shared/.

Covers the parts of JSON Schema the contracts use and refuses anything else, so a new
keyword needs a generator change instead of producing a silently wrong type.
"""

import argparse
import json
import subprocess
import sys
import textwrap
from pathlib import Path
from typing import Any

Schema = dict[str, Any]

ROOT = Path(__file__).parents[1]
INDEX = ROOT / "shared" / "contracts.schema.json"
OUT = ROOT / "server" / "puddles_server" / "contracts.py"
BANNER = '"""Generated from shared/contracts.schema.json by just gen. Do not edit."""'
SCALARS = {"string": "str", "integer": "int", "number": "float", "boolean": "bool"}
TYPING = ("Literal", "NotRequired", "TypedDict")
UNSUPPORTED = ("allOf", "anyOf", "not", "if", "patternProperties")


def refuse_unsupported(node: Schema) -> None:
    """Raise on keywords the generator would otherwise drop without a word."""
    for keyword in UNSUPPORTED:
        if keyword in node:
            raise ValueError(f"unsupported keyword {keyword}: {json.dumps(node)}")


class Generator:
    """Walks schemas from a root, declaring each titled schema once, dependencies first."""

    def __init__(self, folder: Path) -> None:
        self.folder = folder
        self.docs: dict[str, Schema] = {}
        self.named: dict[str, Schema] = {}
        self.blocks: list[str] = []

    def load(self, name: str) -> Schema:
        if name not in self.docs:
            self.docs[name] = json.loads((self.folder / name).read_text())
        return self.docs[name]

    def resolve(self, ref: str, doc: str) -> tuple[Schema, str]:
        """Follow a $ref like `other.schema.json#/$defs/Name`, relative to the folder."""
        file, _, pointer = ref.partition("#")
        doc = file or doc
        node = self.load(doc)
        for part in filter(None, pointer.split("/")):
            node = node[part]
        return node, doc

    def type_of(self, node: Schema, doc: str) -> str:
        if "$ref" in node:
            return self.type_of(*self.resolve(node["$ref"], doc))
        if "title" in node:
            return self.declare(node, doc)
        return self.expression(node, doc)

    def expression(self, node: Schema, doc: str) -> str:
        refuse_unsupported(node)
        if "const" in node:
            return f"Literal[{json.dumps(node['const'])}]"
        if "enum" in node:
            return f"Literal[{', '.join(json.dumps(value) for value in node['enum'])}]"
        if "oneOf" in node:
            return " | ".join(self.type_of(branch, doc) for branch in node["oneOf"])
        return self.by_type(node, doc)

    def by_type(self, node: Schema, doc: str) -> str:
        kind = node.get("type")
        if isinstance(kind, list):
            return " | ".join(SCALARS[name] for name in kind)
        if kind == "array":
            return f"list[{self.type_of(node['items'], doc)}]"
        if kind == "object" and "properties" not in node:
            extra = node.get("additionalProperties")
            return f"dict[str, {self.type_of(extra, doc) if isinstance(extra, dict) else 'object'}]"
        if kind not in SCALARS:
            raise ValueError(f"unsupported schema: {json.dumps(node)}")
        return SCALARS[kind]

    def declare(self, node: Schema, doc: str) -> str:
        name: str = node["title"]
        if self.claim(name, node):
            self.blocks.append(self.declaration(name, node, doc))
        return name

    def claim(self, name: str, node: Schema) -> bool:
        """Record the schema behind a title; True the first time, raise if another uses it."""
        if name not in self.named:
            self.named[name] = node
            return True
        if self.named[name] is not node:
            raise ValueError(f"title {name} is declared twice, in different schemas")
        return False

    def declaration(self, name: str, node: Schema, doc: str) -> str:
        if "properties" not in node:
            return f"type {name} = {self.expression(node, doc)}"
        if "oneOf" not in node:
            return self.typed_dict(name, node, doc, "TypedDict")
        # Common fields plus one branch per kind: each branch extends the common fields.
        common = f"{name}Common"
        self.blocks.append(self.typed_dict(common, node, doc, "TypedDict"))
        members = []
        for branch in node["oneOf"]:
            target, target_doc = self.resolve(branch["$ref"], doc)
            self.claim(target["title"], target)
            self.blocks.append(self.typed_dict(target["title"], target, target_doc, common))
            members.append(target["title"])
        return f"type {name} = {' | '.join(members)}"

    def typed_dict(self, name: str, node: Schema, doc: str, base: str) -> str:
        refuse_unsupported(node)
        required = set(node.get("required", []))
        lines = [f"class {name}({base}):"]
        if "description" in node:
            text = textwrap.fill(node["description"], 90, subsequent_indent="    ")
            lines += [f'    """{text}"""', ""]
        for field, schema in node["properties"].items():
            kind = self.type_of(schema, doc)
            lines.append(f"    {field}: {kind if field in required else f'NotRequired[{kind}]'}")
        return "\n".join(lines)


def generate(index: Path) -> str:
    """Return Python source declaring every type reachable from the index schema."""
    generator = Generator(index.parent)
    generator.type_of(generator.load(index.name), index.name)
    body = "\n\n\n".join(generator.blocks)
    used = ", ".join(name for name in TYPING if name in body)
    gap = "" if body.startswith("type ") else "\n"  # isort leaves one line before a statement
    return f"from typing import {used}\n{gap}\n{body}\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=OUT)
    out: Path = parser.parse_args(argv).out
    out.write_text(f"{BANNER}\n\n{generate(INDEX)}")
    subprocess.run([sys.executable, "-m", "ruff", "format", "--quiet", str(out)], check=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
