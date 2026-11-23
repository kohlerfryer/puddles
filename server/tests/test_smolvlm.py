import json
import subprocess
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace
from typing import Any

import pytest

from puddles_server import smolvlm
from puddles_server.models import load_model
from puddles_server.smolvlm import (
    CONFUSED_REACTION,
    DEFAULT_MODEL_ID,
    SmolVLMModel,
    build_messages,
    first_json_object,
    parse_reaction,
    pick_device,
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


def fake_torch(*, mps: bool = False, cuda: bool = False) -> Any:
    return SimpleNamespace(
        backends=SimpleNamespace(mps=SimpleNamespace(is_available=lambda: mps)),
        cuda=SimpleNamespace(is_available=lambda: cuda),
    )


@pytest.mark.parametrize(
    ("mps", "cuda", "device"),
    [(True, True, "mps"), (False, True, "cuda"), (False, False, "cpu")],
)
def test_pick_device_prefers_mps_then_cuda(mps: bool, cuda: bool, device: str) -> None:
    assert pick_device(fake_torch(mps=mps, cuda=cuda)) == device


def test_model_reads_its_id_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    loads: list[tuple[str, str]] = []

    def load(model_id: str, prompt: str) -> smolvlm.Generate:
        loads.append((model_id, prompt))
        return lambda image: json.dumps(REACTION) if image == b"jpeg" else ""

    monkeypatch.setattr(smolvlm, "load_generator", load)
    monkeypatch.setenv("PUDDLES_SMOLVLM_ID", "HuggingFaceTB/SmolVLM-500M-Instruct")
    model = SmolVLMModel()
    monkeypatch.delenv("PUDDLES_SMOLVLM_ID")
    default = SmolVLMModel()

    assert model.name == "smolvlm"
    assert [model_id for model_id, _ in loads] == [
        "HuggingFaceTB/SmolVLM-500M-Instruct",
        DEFAULT_MODEL_ID,
    ]
    assert loads[0][1] == smolvlm.PROMPT_PATH.read_text()
    assert default.react(b"jpeg") == REACTION
    assert default.react(b"other") == CONFUSED_REACTION


def test_choosing_smolvlm_imports_no_heavy_library_until_it_loads() -> None:
    heavy = "{'torch', 'transformers', 'outlines', 'PIL'}"
    code = f"import sys, puddles_server.app; print(sorted({heavy} & set(sys.modules)))"
    server = Path(__file__).parents[1]
    result = subprocess.run(
        [sys.executable, "-c", code], capture_output=True, text=True, check=True, cwd=server
    )

    assert result.stdout.strip() == "[]"


def test_puddles_model_smolvlm_selects_the_backend(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(smolvlm, "load_generator", lambda model_id, prompt: lambda image: "")

    model = load_model("smolvlm")

    assert isinstance(model, SmolVLMModel)
    assert model.react(b"jpeg") == CONFUSED_REACTION


class FakeTensor:
    def __init__(self, label: str) -> None:
        self.label = label
        self.shape = (1, 7)

    def __getitem__(self, key: tuple[slice, slice]) -> str:
        return f"{self.label}[{key[1].start}:]"


class FakeInputs(dict[str, Any]):
    def to(self, device: str) -> "FakeInputs":
        self["device"] = device
        return self


class FakeProcessor:
    def apply_chat_template(self, messages: Any, add_generation_prompt: bool) -> str:
        assert add_generation_prompt
        return f"CHAT({messages[0]['content'][1]['text'][:9]})"

    def __call__(self, text: str, images: list[Any], return_tensors: str) -> FakeInputs:
        assert return_tensors == "pt"
        return FakeInputs(input_ids=FakeTensor("ids"), text=text, images=images)

    def batch_decode(self, reply: str, skip_special_tokens: bool) -> list[str]:
        assert skip_special_tokens
        return [f"decoded {reply}"]


class FakeVLM:
    def __init__(self) -> None:
        self.device = ""

    def to(self, device: str) -> "FakeVLM":
        self.device = device
        return self

    def generate(self, **inputs: Any) -> FakeTensor:
        return FakeTensor(f"out({inputs['text']},{inputs['images'][0]},{inputs['device']})")


class FakePhoto:
    def __init__(self, data: bytes) -> None:
        self.data = data

    def __str__(self) -> str:
        return self.data.decode()


def install_fakes(monkeypatch: pytest.MonkeyPatch, outlines: ModuleType) -> FakeVLM:
    vlm = FakeVLM()
    auto = SimpleNamespace
    fakes = {
        "torch": module("torch", **vars(fake_torch(cuda=True))),
        "transformers": module(
            "transformers",
            AutoProcessor=auto(from_pretrained=lambda model_id: FakeProcessor()),
            AutoModelForImageTextToText=auto(from_pretrained=lambda model_id: vlm),
        ),
        "PIL.Image": module("PIL.Image", open=lambda stream: FakePhoto(stream.read())),
        "outlines": outlines,
    }
    for name, fake in fakes.items():
        monkeypatch.setitem(sys.modules, name, fake)
    return vlm


def broken_outlines() -> ModuleType:
    def refuse(model: Any, processor: Any) -> None:
        raise NotImplementedError("no vision support")

    return module("outlines", from_transformers=refuse)


def json_schema(schema: dict[str, Any], whitespace_pattern: str) -> str:
    assert whitespace_pattern == "[ ]?"
    return str(schema["title"])


def schema_outlines(calls: list[Any]) -> ModuleType:
    def generator(wrapped: Any, schema: Any) -> Any:
        def run(prompt: list[Any], max_new_tokens: int) -> str:
            calls.append((wrapped, schema, prompt, max_new_tokens))
            return json.dumps(REACTION)

        return run

    return module(
        "outlines",
        from_transformers=lambda model, processor: ("wrapped", model),
        types=SimpleNamespace(JsonSchema=json_schema),
        Generator=generator,
        inputs=SimpleNamespace(Image=lambda photo: f"Image({photo})"),
    )


def test_loader_decodes_under_the_schema_when_outlines_can(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[Any] = []
    vlm = install_fakes(monkeypatch, schema_outlines(calls))

    generate = smolvlm.load_generator("some/model", "You are Puddles")

    assert generate(b"jpeg") == json.dumps(REACTION)
    assert vlm.device == "cuda"
    assert calls == [
        (("wrapped", vlm), "Reaction", ["CHAT(You are P)", "Image(jpeg)"], smolvlm.MAX_NEW_TOKENS)
    ]


def test_loader_generates_freely_when_outlines_cannot_constrain(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install_fakes(monkeypatch, broken_outlines())

    generate = smolvlm.load_generator("some/model", "You are Puddles")

    assert generate(b"jpeg") == "decoded out(CHAT(You are P),jpeg,cuda)[7:]"


def module(name: str, **attributes: Any) -> ModuleType:
    fake = ModuleType(name)
    fake.__dict__.update(attributes)
    return fake
