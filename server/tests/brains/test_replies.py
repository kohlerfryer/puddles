"""The object matcher on real SmolVLM replies, replayed from cassettes so no GPU is needed.

The cassettes in `server/tests/cassettes/` hold the base model's replies to the bench photos; see
`scripts/cassettes.py` to re-record them. A re-recorded reply that changes what Puddles makes of a
photo fails here, so the change shows up as a diff to the answers below.
"""

import json
from typing import Any

import pytest
from jsonschema import Draft202012Validator

from puddles_server import smolvlm
from puddles_server.brains import object_matcher
from puddles_server.models import ReactionModel, load_model
from scripts import cassettes
from scripts.bench_reactions import photos

MODELS = ("smolvlm", "smolvlm-json")
PHOTOS = photos(cassettes.PHOTOS)
REACTION = Draft202012Validator(json.loads(smolvlm.SCHEMA_PATH.read_text()))

# What the base namer and the templates make of each photo: the object and the prop it spawns.
NAMER_ANSWERS = {
    "book-cover.jpg": ("book", {"id": "book"}),
    "cereal-bowl.jpg": ("bowl", {"id": "bowl"}),
    "toothbrush.jpg": ("toothbrush", {"id": "toothbrush"}),
    "toy-car.jpg": ("toy car", {"id": "toy_car"}),
    "water-bottle.jpg": ("bottle", {"id": "bottle"}),
}


def replayed(monkeypatch: pytest.MonkeyPatch, name: str) -> ReactionModel:
    """The real model class `name` names, generating from its cassette instead of the weights."""
    cassette = json.loads(cassettes.path_for(name).read_text())
    monkeypatch.setattr(smolvlm, "load_generator", lambda *_a, **_kw: cassettes.replayer(cassette))
    return load_model(name)


def matched(model: ReactionModel) -> dict[str, dict[str, Any]]:
    return {path.name: object_matcher.match(model, path.read_bytes()) for path in PHOTOS}


@pytest.mark.parametrize("name", MODELS)
def test_each_cassette_has_a_reply_to_every_bench_photo_as_it_is_now(name: str) -> None:
    cassette = json.loads(cassettes.path_for(name).read_text())

    assert cassette["model"] == name
    assert {photo: entry["sha256"] for photo, entry in cassette["replies"].items()} == {
        path.name: cassettes.digest(path.read_bytes()) for path in PHOTOS
    }


@pytest.mark.parametrize("name", MODELS)
def test_every_replayed_reaction_fits_the_schema(
    monkeypatch: pytest.MonkeyPatch, name: str
) -> None:
    for photo, reaction in matched(replayed(monkeypatch, name)).items():
        assert REACTION.is_valid(reaction), photo


def test_the_namer_names_each_photo_and_the_matcher_spawns_its_library_prop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reactions = matched(replayed(monkeypatch, "smolvlm"))

    answers = {photo: (r["object"], r["prop"]) for photo, r in reactions.items()}
    assert answers == NAMER_ANSWERS


def test_the_json_baseline_copies_the_prompts_banana_for_every_photo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Why the base model writing whole reactions is only the eval baseline (#104)."""
    reactions = matched(replayed(monkeypatch, "smolvlm-json"))

    assert {r["object"] for r in reactions.values()} == {"banana"}
    assert {r["prop"]["id"] for r in reactions.values()} == {"banana"}
