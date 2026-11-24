import json
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from puddles_server.contracts import Contracts, Manifest, ManifestCommon
from puddles_server.models import FakeModel

SHARED = Path(__file__).parents[2] / "shared"
SCHEMAS = {path.name: json.loads(path.read_text()) for path in SHARED.glob("*.schema.json")}
REGISTRY = Registry().with_resources(
    (schema["$id"], Resource.from_contents(schema)) for schema in SCHEMAS.values()
)
INDEX = SCHEMAS["contracts.schema.json"]


def validator(contract: str) -> Draft202012Validator:
    """Validator for a contract named as in the index, e.g. event."""
    return Draft202012Validator(SCHEMAS[INDEX["properties"][contract]["$ref"]], registry=REGISTRY)


def common(plugin_id: str) -> ManifestCommon:
    name = plugin_id.replace("-", " ").capitalize()
    return {
        "id": plugin_id,
        "contract": "1",
        "name": name,
        "authors": ["Puddles"],
        "license": "MIT",
    }


VALID: Contracts = {
    "event": {"t": 1033.3, "type": "observation.smile", "source": "smile", "data": {"level": 0.6}},
    "observation": {
        "kid": {
            "present": True,
            "pose": {"x": 0.4, "y": 0.5},
            "gesture": "wave",
            "attention": 0.9,
            "distance": 1.8,
        },
        "held_object": {"id": "banana", "confidence": 0.8},
        "smile": {"level": 0.6, "delta": 0.2},
        "laugh": False,
        "speech": {"active": True, "command": "jump"},
        "world": {"near": [{"id": "reeds", "affords": ["hide_in"]}]},
        "self": {"mood": "curious", "needs": {"rest": 0.2}, "doing": "idle"},
    },
    "intent": {
        "brain": "object-matcher",
        "priority": 2,
        "kind": "routine",
        "steps": [
            {"skill": "look_at", "args": {"target": "object"}, "mood": "curious", "think": "cat"},
            {"skill": "run_away", "args": {"target": "object"}, "say": "NOPE."},
        ],
        "why": "a toy cat was held up",
        "features": ["slapstick", "uses_object"],
    },
    "step": {"skill": "wear", "args": {"target": "hat", "seconds": 2, "wobble": True}},
    "outcome": {"step": 1, "status": "failed", "reason": "dropped", "effects": {"hat": "floor"}},
    "reward": {
        "bit_id": "wear-hat",
        "smile_delta": 0.35,
        "laugh": True,
        "talk": False,
        "attention": 0.8,
        "window_ms": 4000,
    },
    "manifest": {
        **common("wear"),
        "kind": "skill",
        "tags": ["silly", "uses_object"],
        "params": {"target": "prop"},
        "needs": ["target.affords:wear", "target.size<=small"],
        "duration_s": 1.5,
        "energy": -0.02,
        "outcomes": ["done", "dropped"],
    },
}

MANIFESTS: list[Manifest] = [
    {
        **common("smile"),
        "kind": "sense",
        "inputs": ["camera"],
        "emits": ["observation.smile"],
        "budget_ms": 4,
    },
    {
        **common("reflexes"),
        "kind": "brain",
        "cadence": "tick",
        "autonomy": 1,
        "latency_budget_ms": 2,
        "intents": ["routine", "behavior"],
    },
    {
        **common("object-matcher"),
        "kind": "brain",
        "cadence": {"on": "observation.held_object"},
        "autonomy": 1,
        "latency_budget_ms": 3000,
        "intents": ["routine"],
    },
    {
        **common("planner"),
        "kind": "brain",
        "cadence": {"every_s": 20},
        "autonomy": 3,
        "latency_budget_ms": 8000,
        "intents": ["routine", "goal"],
    },
    {**common("christmas-tree"), "kind": "content", "type": "prop"},
]

INVALID: list[tuple[str, dict[str, Any]]] = [
    ("event", {**VALID["event"], "type": "chat.hello"}),
    ("event", {**VALID["event"], "type": "observation"}),
    ("event", {**VALID["event"], "t": -1}),
    ("event", {key: value for key, value in VALID["event"].items() if key != "data"}),
    ("observation", {**VALID["observation"], "smile": {"level": 1.5, "delta": 0}}),
    ("observation", {**VALID["observation"], "photo": "data:image/jpeg;base64,..."}),
    ("observation", {**VALID["observation"], "self": {"mood": "angry", "needs": {}, "doing": "x"}}),
    ("intent", {**VALID["intent"], "kind": "whim"}),
    ("intent", {**VALID["intent"], "steps": []}),
    ("intent", {**VALID["intent"], "steps": [VALID["step"]] * 9}),
    ("intent", {**VALID["intent"], "why": ""}),
    ("step", {"skill": "wear"}),
    ("step", {"skill": "Wear It", "args": {}}),
    ("step", {**VALID["step"], "mood": "angry"}),
    ("step", {**VALID["step"], "args": {"target": {"nested": True}}}),
    ("outcome", {**VALID["outcome"], "status": "dropped"}),
    ("outcome", {**VALID["outcome"], "step": -1}),
    ("reward", {**VALID["reward"], "smile_delta": 2}),
    ("reward", {**VALID["reward"], "window_ms": 0}),
    ("manifest", {**VALID["manifest"], "kind": "gadget"}),
    ("manifest", {**VALID["manifest"], "contract": "v1"}),
    ("manifest", {**VALID["manifest"], "emits": ["observation.smile"]}),
    ("manifest", {key: value for key, value in VALID["manifest"].items() if key != "license"}),
    ("manifest", {**MANIFESTS[0], "emits": ["reward.smile", "chat.hi"]}),
    ("manifest", {**MANIFESTS[1], "cadence": "sometimes"}),
    ("manifest", {**MANIFESTS[1], "autonomy": 4}),
    ("manifest", {**MANIFESTS[-1], "type": "weather"}),
]


@pytest.mark.parametrize("name", sorted(SCHEMAS))
def test_every_schema_is_valid_json_schema_2020_12(name: str) -> None:
    Draft202012Validator.check_schema(SCHEMAS[name])
    assert SCHEMAS[name]["$id"].endswith(f"/shared/{name}")


def test_the_index_lists_every_contract_once() -> None:
    listed = sorted(ref["$ref"] for ref in INDEX["properties"].values())

    assert listed == sorted(set(SCHEMAS) - {"contracts.schema.json", "reaction.schema.json"})


def test_one_valid_example_of_each_contract_passes_the_index() -> None:
    Draft202012Validator(INDEX, registry=REGISTRY).validate(VALID)


@pytest.mark.parametrize(("contract", "example"), sorted(VALID.items()))
def test_valid_examples_pass(contract: str, example: object) -> None:
    validator(contract).validate(example)


@pytest.mark.parametrize("manifest", MANIFESTS, ids=lambda m: str(m["id"]))
def test_every_plugin_kind_has_a_valid_manifest(manifest: Manifest) -> None:
    validator("manifest").validate(manifest)


@pytest.mark.parametrize(("contract", "example"), INVALID)
def test_invalid_examples_fail(contract: str, example: dict[str, Any]) -> None:
    assert not validator(contract).is_valid(example)


@pytest.mark.parametrize("verb", SCHEMAS["reaction.schema.json"]["$defs"]["Verb"]["enum"])
def test_every_reaction_verb_maps_onto_a_step(verb: str) -> None:
    assert validator("step").is_valid({"skill": verb, "args": {"target": "object"}})


def test_every_reaction_step_maps_onto_a_step() -> None:
    steps = [
        {"skill": step["do"], "args": {"target": step.get("target", "none")}}
        | {key: step[key] for key in ("mood", "say") if key in step}
        for step in FakeModel().react(b"")["script"]
    ]

    assert steps
    assert all(validator("step").is_valid(step) for step in steps)
