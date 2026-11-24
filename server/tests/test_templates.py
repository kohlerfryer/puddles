import json
import random
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from puddles_server.templates import KIND_ORDER, clean_name, kind_of, reaction_for

SCHEMA = json.loads(
    (Path(__file__).resolve().parents[2] / "shared" / "reaction.schema.json").read_text()
)
NAMES = {
    "food": "Banana",
    "animal": "Teddy bear",
    "wearable": "Hat",
    "flat": "Book",
    "round": "Tennis ball",
    "vehicle": "Toy car",
    "container": "Cup",
    "other": "Keyboard",
}


@pytest.mark.parametrize(
    ("raw", "kind"),
    [
        ("Apple", "food"),
        ("Fruit", "food"),
        ("Teddy bear", "animal"),
        ("Toy car", "vehicle"),
        ("Hat", "wearable"),
        ("Shoes", "wearable"),
        ("Book", "flat"),
        ("Tennis ball", "round"),
        ("Cup", "container"),
        ("Keyboard", "other"),
    ],
)
def test_sorts_names_into_kinds(raw: str, kind: str) -> None:
    assert kind_of(clean_name(raw)) == kind


@pytest.mark.parametrize(
    ("raw", "name"),
    [
        ("A banana.", "banana"),
        ("An apple", "apple"),
        ("The cat", "cat"),
        (" A big red ball, I think.", "big red ball"),
        ("It is a toy car", "toy car"),
        ("This is an orange.", "orange"),
        ("...", "thing"),
    ],
)
def test_cleans_model_answers(raw: str, name: str) -> None:
    assert clean_name(raw) == name


def test_every_kind_gives_schema_valid_reactions() -> None:
    validator = Draft202012Validator(SCHEMA)
    for kind in (*KIND_ORDER, "other"):
        for seed in range(8):
            reaction = reaction_for(NAMES[kind], random.Random(seed))
            assert kind_of(reaction["object"]) == kind
            assert list(validator.iter_errors(reaction)) == []


def test_lines_are_filled_with_the_name() -> None:
    for seed in range(8):
        reaction = reaction_for("A banana.", random.Random(seed))
        lines = [step["say"] for step in reaction["script"] if "say" in step]
        assert not any("{" in line or "}" in line for line in lines)
        assert reaction["object"] == "banana"


def test_reaction_only_eats_food() -> None:
    rng = random.Random(1)
    snack = reaction_for("Banana", rng)
    toy = reaction_for("Teddy bear", rng)

    assert snack["traits"]["edible"] is True
    assert toy["traits"]["edible"] is False
    assert all(step["do"] != "eat" for step in toy["script"])


@pytest.mark.parametrize(
    ("raw", "article"),
    [("An apple", "an apple"), ("Apple", "an apple"), ("Unicorn", "a unicorn"), ("Cat", "a cat")],
)
def test_uses_a_or_an(raw: str, article: str) -> None:
    lines = [
        step.get("say", "").lower()
        for seed in range(16)
        for step in reaction_for(raw, random.Random(seed))["script"]
    ]

    assert any(article in line for line in lines)
    assert not any(f"a {article}" in line or f"an {article}" in line for line in lines)
