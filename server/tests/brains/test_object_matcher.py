import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from puddles_server.brains import object_matcher
from puddles_server.models import FakeModel

SHARED = Path(__file__).parents[3] / "shared"
SCHEMAS = [json.loads(path.read_text()) for path in SHARED.glob("*.schema.json")]
REGISTRY = Registry().with_resources(
    (schema["$id"], Resource.from_contents(schema)) for schema in SCHEMAS
)
MANIFEST_SCHEMA = next(schema for schema in SCHEMAS if schema["title"] == "Manifest")
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


def test_matching_returns_the_models_reaction_unchanged() -> None:
    assert object_matcher.match(FakeModel(), JPEG) == FakeModel().react(JPEG)
