import json
import subprocess
import sys
from pathlib import Path

import pytest

from puddles_server import smolvlm
from puddles_server.models import load_model
from puddles_server.smolvlm import (
    CONFUSED_REACTION,
    DEFAULT_MODEL_ID,
    SmolVLMModel,
    SmolVLMNamerModel,
    build_messages,
    first_json_object,
    parse_reaction,
)

SHARED = Path(__file__).parents[2] / "shared"
REACTION = {
    "holding": True,
    "object": "banana",
    "traits": {"size": "small", "weight": "light", "shape": "long", "edible": True},
    "script": [
        {"do": "walk_to", "target": "object", "mood": "curious"},
        {"do": "eat", "target": "object", "mood": "happy", "say": "Yum!"},
    ],
}


def test_prompt_lives_in_shared_and_names_every_schema_choice() -> None:
    prompt = smolvlm.PROMPT_PATH.read_text()
    schema = json.loads((SHARED / "reaction.schema.json").read_text())

    assert smolvlm.PROMPT_PATH.parent == SHARED.resolve()
    for name in ("Verb", "Target", "Mood", "Size", "Weight", "Shape"):
        for choice in schema["$defs"][name]["enum"]:
            assert choice in prompt, f"{name} {choice} missing from the prompt"


def test_prompt_examples_are_reactions() -> None:
    examples = [
        json.loads(line)
        for line in smolvlm.PROMPT_PATH.read_text().splitlines()
        if line.startswith('{"holding": true, "object": "')
    ]

    assert [example["object"] for example in examples] == ["banana", "toy cat"]
    for example in examples:
        assert parse_reaction(json.dumps(example)) == example
        assert 2 <= len(example["script"]) <= 5


def test_messages_put_the_photo_before_the_prompt() -> None:
    assert build_messages("Quack?") == [
        {"role": "user", "content": [{"type": "image"}, {"type": "text", "text": "Quack?"}]}
    ]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        pytest.param('Sure! {"a": {"b": "}"}} trailing {"c": 1}', '{"a": {"b": "}"}}', id="first"),
        pytest.param('{"a": [1, 2', '{"a": [1, 2]}', id="cut-in-list"),
        pytest.param('{"say": "Quack \\"hi', '{"say": "Quack \\"hi"}', id="cut-in-string"),
        pytest.param('{"say": "Quack \\', '{"say": "Quack "}', id="cut-mid-escape"),
        pytest.param('{"say": "a\\\\', '{"say": "a\\\\"}', id="cut-after-escaped-slash"),
        pytest.param('{"say": "Quack \\\n', '{"say": "Quack \\\n"}', id="cut-before-newline"),
        pytest.param("no json here", None, id="none"),
    ],
)
def test_first_json_object_finds_and_closes_the_object(text: str, expected: str | None) -> None:
    assert first_json_object(text) == expected


def test_parse_reaction_reads_a_clean_reply() -> None:
    assert parse_reaction(json.dumps(REACTION)) == REACTION


def test_parse_reaction_repairs_chatter_trailing_commas_and_truncation() -> None:
    reply = "Here you go:\n" + json.dumps(REACTION).replace("}]}", "},]}")[:-3]

    assert parse_reaction(reply) == REACTION


@pytest.mark.parametrize(
    "reply",
    [
        pytest.param("I see a banana!", id="no-json"),
        pytest.param('{"holding": tru', id="unrepairable"),
        pytest.param('{"holding": true, "object": "banana"}', id="missing-keys"),
        pytest.param("[1, 2]", id="not-an-object"),
    ],
)
def test_parse_reaction_falls_back_to_the_confused_reaction(reply: str) -> None:
    reaction = parse_reaction(reply)

    assert reaction == CONFUSED_REACTION
    assert reaction is not CONFUSED_REACTION


def test_decoding_schema_caps_strings_and_keeps_the_rest() -> None:
    shared = json.loads((SHARED / "reaction.schema.json").read_text())

    schema = smolvlm.decoding_schema()

    assert schema["properties"]["object"]["maxLength"] == smolvlm.MAX_OBJECT_CHARS
    assert schema["$defs"]["Step"]["properties"]["say"]["maxLength"] == smolvlm.MAX_SAY_CHARS
    del schema["properties"]["object"]["maxLength"]
    del schema["$defs"]["Step"]["properties"]["say"]["maxLength"]
    assert schema == shared


def test_model_reads_its_id_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    loads: list[tuple[str, str]] = []

    def load(model_id: str, prompt: str, **_: object) -> smolvlm.Generate:
        loads.append((model_id, prompt))
        return lambda image: json.dumps(REACTION) if image == b"jpeg" else ""

    monkeypatch.setattr(smolvlm, "load_generator", load)
    monkeypatch.setenv("PUDDLES_SMOLVLM_ID", "HuggingFaceTB/SmolVLM-500M-Instruct")
    model = SmolVLMModel()
    monkeypatch.delenv("PUDDLES_SMOLVLM_ID")
    default = SmolVLMModel()

    assert model.name == "smolvlm-json"
    assert [model_id for model_id, _ in loads] == [
        "HuggingFaceTB/SmolVLM-500M-Instruct",
        DEFAULT_MODEL_ID,
    ]
    assert loads[0][1] == smolvlm.PROMPT_PATH.read_text()
    assert default.react(b"jpeg") == REACTION
    assert default.react(b"other") == CONFUSED_REACTION


def test_choosing_smolvlm_imports_no_heavy_library_until_it_loads() -> None:
    heavy = "{'torch', 'transformers', 'xgrammar', 'PIL'}"
    code = f"import sys, puddles_server.app; print(sorted({heavy} & set(sys.modules)))"
    server = Path(__file__).parents[1]
    result = subprocess.run(
        [sys.executable, "-c", code], capture_output=True, text=True, check=True, cwd=server
    )

    assert result.stdout.strip() == "[]"


def test_puddles_model_names_select_the_backends(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(smolvlm, "load_generator", lambda *_args, **_kw: lambda image: "")

    full = load_model("smolvlm-json")

    assert isinstance(full, SmolVLMModel)
    assert full.react(b"jpeg") == CONFUSED_REACTION
    assert isinstance(load_model("smolvlm"), SmolVLMNamerModel)


def test_namer_asks_a_short_free_question_and_fills_a_template(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, dict[str, object]]] = []

    def load(model_id: str, prompt: str, **options: object) -> smolvlm.Generate:
        calls.append((prompt, options))
        return lambda image: " Banana.\n"

    monkeypatch.setattr(smolvlm, "load_generator", load)
    model = SmolVLMNamerModel()
    reaction = model.react(b"jpeg")

    assert calls == [
        (smolvlm.NAME_PROMPT, {"constrained": False, "max_new_tokens": smolvlm.NAME_TOKENS})
    ]
    assert model.name == "smolvlm"
    assert reaction["object"] == "banana"
    assert reaction["traits"]["edible"] is True
