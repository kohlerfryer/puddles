import random

import pytest

from puddles_server.templates import KIND_ORDER, SCRIPTS, clean_name, kind_of, reaction_for

VERBS = {
    "walk_to",
    "run_to",
    "run_away",
    "hide_behind",
    "look_at",
    "sniff",
    "peck",
    "eat",
    "push",
    "jump",
    "jump_over",
    "sit_on",
    "wear",
    "circle",
    "dance",
    "flap",
    "freeze",
    "fall_over",
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


def test_cleans_model_answers() -> None:
    assert clean_name(" A big red ball, I think.") == "a big red"
    assert clean_name("...") == "thing"


def test_every_template_uses_known_verbs_and_short_lines() -> None:
    for kind in (*KIND_ORDER, "other"):
        for script in SCRIPTS[kind]:
            assert 2 <= len(script) <= 5
            for step in script:
                assert step["do"] in VERBS
                assert len(step.get("say", "").split()) <= 12


def test_reaction_names_the_object_and_only_eats_food() -> None:
    rng = random.Random(1)
    snack = reaction_for("Banana", rng)
    toy = reaction_for("Teddy bear", rng)

    assert snack["object"] == "banana"
    assert snack["traits"]["edible"] is True
    assert toy["traits"]["edible"] is False
    assert all(step["do"] != "eat" for step in toy["script"])
    assert any("{name}" not in step.get("say", "") for step in snack["script"])


def test_uses_a_or_an() -> None:
    lines = [
        step.get("say", "")
        for _ in range(8)
        for step in reaction_for("Apple", random.Random(_))["script"]
    ]

    assert any("an apple" in line for line in lines)
    assert not any("a apple" in line for line in lines)
