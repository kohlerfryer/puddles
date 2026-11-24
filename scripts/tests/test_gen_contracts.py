import json
from pathlib import Path
from typing import Any

import pytest

from scripts.gen_contracts import generate, main

ID = "https://example.com/shared/"


def write(folder: Path, name: str, schema: dict[str, Any]) -> None:
    (folder / name).write_text(json.dumps({"$id": ID + name, **schema}))


def test_objects_become_typed_dicts_with_optional_fields(tmp_path: Path) -> None:
    write(
        tmp_path,
        "root.schema.json",
        {
            "title": "Root",
            "description": "The root.",
            "type": "object",
            "required": ["name"],
            "properties": {
                "name": {"type": "string"},
                "count": {"type": "integer"},
                "ratio": {"type": "number"},
                "on": {"type": "boolean"},
                "tags": {"type": "array", "items": {"type": "string"}},
                "args": {"type": "object", "additionalProperties": {"type": ["string", "number"]}},
                "data": {"type": "object", "additionalProperties": True},
            },
        },
    )

    assert generate(tmp_path / "root.schema.json") == (
        "from typing import NotRequired, TypedDict\n\n\n"
        "class Root(TypedDict):\n"
        '    """The root."""\n\n'
        "    name: str\n"
        "    count: NotRequired[int]\n"
        "    ratio: NotRequired[float]\n"
        "    on: NotRequired[bool]\n"
        "    tags: NotRequired[list[str]]\n"
        "    args: NotRequired[dict[str, str | float]]\n"
        "    data: NotRequired[dict[str, object]]\n"
    )


def test_refs_across_files_become_named_types_declared_once(tmp_path: Path) -> None:
    write(
        tmp_path,
        "other.schema.json",
        {
            "title": "Leaf",
            "type": "object",
            "required": ["mood"],
            "properties": {"mood": {"$ref": "#/$defs/Mood"}},
            "$defs": {"Mood": {"title": "Mood", "enum": ["happy", "sad"]}},
        },
    )
    write(
        tmp_path,
        "root.schema.json",
        {
            "title": "Root",
            "type": "object",
            "required": ["a", "b", "c"],
            "properties": {
                "a": {"$ref": "other.schema.json"},
                "b": {"type": "array", "items": {"$ref": "other.schema.json"}},
                "c": {"$ref": "other.schema.json#/$defs/Mood"},
            },
        },
    )

    assert generate(tmp_path / "root.schema.json") == (
        "from typing import Literal, TypedDict\n\n"
        'type Mood = Literal["happy", "sad"]\n\n\n'
        "class Leaf(TypedDict):\n"
        "    mood: Mood\n\n\n"
        "class Root(TypedDict):\n"
        "    a: Leaf\n"
        "    b: list[Leaf]\n"
        "    c: Mood\n"
    )


def test_common_fields_with_one_of_become_a_base_class_and_a_union(tmp_path: Path) -> None:
    branch = {"type": "object", "required": ["kind"]}
    write(
        tmp_path,
        "root.schema.json",
        {
            "title": "Plugin",
            "type": "object",
            "required": ["id"],
            "properties": {"id": {"type": "string"}},
            "oneOf": [{"$ref": "#/$defs/A"}, {"$ref": "#/$defs/B"}],
            "$defs": {
                "A": {**branch, "title": "A", "properties": {"kind": {"const": "a"}}},
                "B": {
                    **branch,
                    "title": "B",
                    "properties": {"kind": {"const": "b"}, "when": {"$ref": "#/$defs/When"}},
                },
                "When": {"title": "When", "oneOf": [{"const": "now"}, {"type": "number"}]},
            },
        },
    )

    assert generate(tmp_path / "root.schema.json") == (
        "from typing import Literal, NotRequired, TypedDict\n\n\n"
        "class PluginCommon(TypedDict):\n"
        "    id: str\n\n\n"
        "class A(PluginCommon):\n"
        '    kind: Literal["a"]\n\n\n'
        'type When = Literal["now"] | float\n\n\n'
        "class B(PluginCommon):\n"
        '    kind: Literal["b"]\n'
        "    when: NotRequired[When]\n\n\n"
        "type Plugin = A | B\n"
    )


def test_unsupported_schemas_are_refused(tmp_path: Path) -> None:
    write(tmp_path, "root.schema.json", {"title": "Root", "type": "null"})

    with pytest.raises(ValueError, match="unsupported schema"):
        generate(tmp_path / "root.schema.json")


@pytest.mark.parametrize("keyword", ["allOf", "anyOf", "not", "if", "patternProperties"])
def test_unsupported_keywords_next_to_a_supported_type_are_refused(
    tmp_path: Path, keyword: str
) -> None:
    write(
        tmp_path,
        "root.schema.json",
        {
            "title": "Root",
            "type": "object",
            "properties": {"name": {"type": "string", keyword: {}}},
        },
    )

    with pytest.raises(ValueError, match=f"unsupported keyword {keyword}"):
        generate(tmp_path / "root.schema.json")


def test_unsupported_keywords_on_an_object_are_refused(tmp_path: Path) -> None:
    write(
        tmp_path,
        "root.schema.json",
        {"title": "Root", "type": "object", "properties": {}, "patternProperties": {}},
    )

    with pytest.raises(ValueError, match="unsupported keyword patternProperties"):
        generate(tmp_path / "root.schema.json")


def test_one_title_declared_from_two_locations_is_refused(tmp_path: Path) -> None:
    write(
        tmp_path,
        "other.schema.json",
        {"title": "Mood", "enum": ["happy"], "$defs": {"Mood": {"title": "Mood", "enum": ["sad"]}}},
    )
    write(
        tmp_path,
        "root.schema.json",
        {
            "title": "Root",
            "type": "object",
            "properties": {
                "a": {"$ref": "other.schema.json"},
                "b": {"$ref": "other.schema.json#/$defs/Mood"},
            },
        },
    )

    with pytest.raises(ValueError, match="title Mood is declared twice"):
        generate(tmp_path / "root.schema.json")


def test_main_writes_the_server_contracts_from_the_shared_index(tmp_path: Path) -> None:
    out = tmp_path / "contracts.py"

    assert main(["--out", str(out)]) == 0
    text = out.read_text()
    assert text.startswith('"""Generated from shared/contracts.schema.json')
    assert "class Contracts(TypedDict):" in text
    assert "class KernelEvent(TypedDict):" in text
    assert "type Manifest = SenseManifest | BrainManifest | SkillManifest | ContentManifest" in text
