import io
import json
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator
from PIL import Image
from referencing import Registry, Resource

from puddles_server.brains import object_matcher
from puddles_server.models import FakeModel

SHARED = Path(__file__).parents[3] / "shared"
SCHEMAS = [json.loads(path.read_text()) for path in SHARED.glob("*.schema.json")]
REGISTRY = Registry().with_resources(
    (schema["$id"], Resource.from_contents(schema)) for schema in SCHEMAS
)
MANIFEST_SCHEMA = next(schema for schema in SCHEMAS if schema["title"] == "Manifest")
REACTION = Draft202012Validator(next(schema for schema in SCHEMAS if schema["title"] == "Reaction"))
GAME_HALF = (
    Path(__file__).parents[3] / "game" / "src" / "plugins" / "brains" / "matcher" / "manifest.json"
)
JPEG = b"\xff\xd8\xff\xe0 not really a jpeg"


class RecordingModel:
    name = "recording"

    def __init__(self) -> None:
        self.images: list[bytes] = []

    def react(self, image: bytes) -> dict[str, Any]:
        self.images.append(image)
        return {"holding": False}


class NamingModel:
    """The fake reaction, naming the object `name`, with `traits` if given."""

    name = "naming"

    def __init__(self, name: str, traits: dict[str, Any] | None = None) -> None:
        self.reaction = {**FakeModel().react(b""), "object": name}
        if traits:
            self.reaction["traits"] = traits

    def react(self, image: bytes) -> dict[str, Any]:
        return dict(self.reaction)


def jpeg(*colors: tuple[int, int, int]) -> bytes:
    """A photo split into equal vertical bands of `colors`."""
    photo = Image.new("RGB", (8 * len(colors), 8))
    for band, color in enumerate(colors):
        photo.paste(color, (8 * band, 0, 8 * band + 8, 8))
    out = io.BytesIO()
    photo.save(out, "JPEG", quality=95)
    return out.getvalue()


def test_the_manifest_is_a_valid_brain_manifest() -> None:
    Draft202012Validator(MANIFEST_SCHEMA, registry=REGISTRY).validate(object_matcher.MANIFEST)
    assert object_matcher.MANIFEST["kind"] == "brain"


def test_the_manifest_names_the_same_brain_as_the_game_half() -> None:
    game = json.loads(GAME_HALF.read_text())
    assert object_matcher.MANIFEST["id"] == game["id"] == "object_matcher"


def test_matching_delegates_the_crop_to_the_reaction_model() -> None:
    model = RecordingModel()

    assert object_matcher.match(model, JPEG) == {"holding": False}
    assert model.images == [JPEG]


def test_matching_keeps_the_models_reaction_and_adds_the_library_answer() -> None:
    reaction = object_matcher.match(FakeModel(), JPEG)

    assert reaction == {**FakeModel().react(JPEG), "prop": {"id": "rubber_duck"}}
    REACTION.validate(reaction)


def test_the_library_is_the_game_halfs_prop_library() -> None:
    assert len(set(object_matcher.PROP_NAMES.values())) >= 30
    assert object_matcher.PROP_NAMES["mug"] == "cup"


@pytest.mark.parametrize(
    ("name", "prop"),
    [
        ("banana", "banana"),
        ("Toy car", "toy_car"),
        ("cereal bowl", "bowl"),
        ("Water bottle.", "bottle"),
        ("I see a teddy bear on a bed", "teddy_bear"),
        ("crayons", "crayon"),
        ("rubber duck", "rubber_duck"),
        ("book cover", "book"),
        ("cat toy", "toy_cat"),
        ("toaster", None),
        ("pencil case", None),
        ("car key", None),
        ("cat food", None),
        ("", None),
    ],
)
def test_names_the_library_prop_by_its_last_known_word(name: str, prop: str | None) -> None:
    assert object_matcher.prop_named(name) == prop


@pytest.mark.parametrize(
    ("name", "archetype"),
    [
        ("toy robot", "box"),
        ("glass jar", "cup"),
        ("pears", "fruit"),
        ("pencil case", "box"),
        ("car key", "stick"),
        ("cat food", "fruit"),
    ],
)
def test_an_archetype_word_after_a_prop_word_names_the_archetype(name: str, archetype: str) -> None:
    traits = {"size": "small", "weight": "light", "shape": "round", "edible": False}
    reaction = {"holding": True, "object": name, "traits": traits}

    answer = object_matcher.library_answer(reaction, JPEG)

    assert answer == {"id": "other", "archetype": archetype, "color": object_matcher.NEUTRAL}


@pytest.mark.parametrize(
    "name", ["gummy bear", "hot dog", "cheese stick", "animal cracker", "chocolate bunny"]
)
def test_food_named_after_a_non_food_word_stays_food(name: str) -> None:
    traits = {"size": "small", "weight": "light", "shape": "long", "edible": True}
    reaction = {"holding": True, "object": name, "traits": traits}

    answer = object_matcher.library_answer(reaction, JPEG)

    assert answer == {"id": "other", "archetype": "fruit", "color": object_matcher.NEUTRAL}


@pytest.mark.parametrize(
    ("name", "edible", "prop"),
    [("teddy bear", False, "teddy_bear"), ("banana", True, "banana"), ("cookies", True, "cookie")],
)
def test_a_named_prop_still_matches_when_its_edibility_agrees(
    name: str, edible: bool, prop: str
) -> None:
    traits = {"size": "small", "weight": "light", "shape": "other", "edible": edible}
    reaction = {"holding": True, "object": name, "traits": traits}

    assert object_matcher.library_answer(reaction, JPEG) == {"id": prop}


@pytest.mark.parametrize(
    ("shape", "edible", "archetype"),
    [
        ("round", True, "fruit"),
        ("long", True, "fruit"),
        ("other", True, "fruit"),
        ("round", False, "ball"),
        ("long", False, "stick"),
        ("flat", False, "flat_thing"),
        ("other", False, "box"),
    ],
)
def test_an_unnamed_object_gets_its_archetype_from_its_traits(
    shape: str, edible: bool, archetype: str
) -> None:
    traits = {"size": "small", "weight": "light", "shape": shape, "edible": edible}
    assert object_matcher.archetype_by_traits(traits) == archetype


def test_the_dominant_colour_is_the_most_common_colourful_one() -> None:
    red, grey, white = (220, 30, 40), (128, 128, 128), (250, 250, 250)

    assert object_matcher.dominant_color([red, grey, grey, white, white]) == "#dc1e28"
    assert object_matcher.dominant_color([grey, white, white]) == "#fafafa"
    assert object_matcher.dominant_color([]) == object_matcher.NEUTRAL


def test_the_crop_colour_comes_from_its_pixels() -> None:
    color = object_matcher.crop_color(jpeg((20, 60, 200), (20, 60, 200), (240, 240, 240)))

    red, green, blue = (int(color[i : i + 2], 16) for i in (1, 3, 5))
    assert blue > 180
    assert max(red, green) < 80


def test_a_crop_that_is_not_an_image_gets_the_neutral_colour() -> None:
    assert object_matcher.crop_color(JPEG) == object_matcher.NEUTRAL


def test_without_pillow_the_crop_gets_the_neutral_colour(monkeypatch: pytest.MonkeyPatch) -> None:
    def missing(name: str) -> None:
        raise ImportError(name)

    monkeypatch.setattr("importlib.import_module", missing)

    assert object_matcher.crop_color(jpeg((200, 30, 30))) == object_matcher.NEUTRAL


def test_the_answer_is_other_with_an_archetype_and_the_crops_colour() -> None:
    traits = {"size": "medium", "weight": "light", "shape": "round", "edible": False}
    reaction = object_matcher.match(NamingModel("mystery", traits), jpeg((200, 30, 30)))

    assert reaction["prop"]["id"] == "other"
    assert reaction["prop"]["archetype"] == "ball"
    assert reaction["prop"]["color"] != object_matcher.NEUTRAL
    REACTION.validate(reaction)


def test_a_reaction_without_an_object_name_gets_no_prop() -> None:
    reaction = {**FakeModel().react(b""), "object": 7}

    class OddModel:
        name = "odd"

        def react(self, image: bytes) -> dict[str, Any]:
            return dict(reaction)

    assert object_matcher.match(OddModel(), JPEG) == reaction
