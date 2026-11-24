"""The object matcher brain (spec §8), server half: the only brain that sees the held-up crop.

`/react` is its endpoint. It hands the crop to the `ReactionModel` the server runs, which stays in
`models.py`, `smolvlm.py` and `templates.py`; the game logs the reply as `observation.object`, and
the brain's game half turns it into a routine.

The reply carries the library answer (spec §7.1), constrained to the installed props plus `other`:
the prop the object's name matches in the game's prop library, or else `other` with an archetype
and the crop's dominant colour. The library is the game's prop content plugin, read when this
module loads, so the server needs that plugin in place.
"""

import importlib
import io
import json
import re
from collections import Counter
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from puddles_server.models import ReactionModel

MANIFEST: dict[str, Any] = json.loads((Path(__file__).parent / "manifest.json").read_text())
LIBRARY_PATH = Path(__file__).resolve().parents[4] / "game/src/plugins/content/props/library.json"
LIBRARY: dict[str, Any] = json.loads(LIBRARY_PATH.read_text())
# Each word that names a prop, and the prop's id: its id and the names it lists.
PROP_NAMES = {
    name: prop_id
    for prop_id, prop in LIBRARY["props"].items()
    for name in [prop_id, *prop.get("names", [])]
}
# Each word the library knows, and the answer it gives: the prop it names, else `other` of the
# archetype it names.
ANSWERS: dict[str, dict[str, str]] = {
    **{
        word: {"id": "other", "archetype": archetype}
        for archetype, kind in LIBRARY["archetypes"].items()
        for word in kind["words"]
    },
    **{name: {"id": prop_id} for name, prop_id in PROP_NAMES.items()},
}
# The archetype for an unnamed object of each shape.
SHAPE_ARCHETYPES = {"round": "ball", "long": "stick", "flat": "flat_thing"}
NEUTRAL = "#c8b89a"
# Pixels whose channels spread less than this are grey, white or black: background, not object.
GREY_SPREAD = 40
# Bits kept of each channel when grouping pixels into colours.
CHANNEL_BITS = 2
# The crop is shrunk to fit this many pixels a side before counting colours.
THUMBNAIL = 32

Pixel = tuple[int, int, int]


def words(name: str) -> list[str]:
    """The name's words, last first: in "toy car" the car is the thing, the toy is a detail."""
    return re.findall(r"[a-z]+", name.lower())[::-1]


def named_answer(name: str) -> dict[str, str] | None:
    """The answer the name's last known word gives, trying each word then its singular."""
    for word in words(name):
        for form in (word, word.removesuffix("s")):
            if form in ANSWERS:
                return dict(ANSWERS[form])
    return None


def prop_named(name: str) -> str | None:
    """The id of the library prop the object's name names, if any."""
    answer = named_answer(name)
    return None if answer is None or answer["id"] == "other" else answer["id"]


def archetype_by_traits(traits: dict[str, Any]) -> str:
    """The archetype an unnamed object's traits suggest; food stays food whatever its shape."""
    if traits.get("edible"):
        return "fruit"
    return SHAPE_ARCHETYPES.get(traits.get("shape", ""), "box")


def bucket(pixel: Pixel) -> Pixel:
    red, green, blue = (channel >> (8 - CHANNEL_BITS) for channel in pixel)
    return red, green, blue


def dominant_color(pixels: Sequence[Pixel]) -> str:
    """The average of the most common colour group, ignoring greys while there is any colour."""
    colourful = [p for p in pixels if max(p) - min(p) >= GREY_SPREAD] or list(pixels)
    if not colourful:
        return NEUTRAL
    top = Counter(map(bucket, colourful)).most_common(1)[0][0]
    members = [p for p in colourful if bucket(p) == top]
    red, green, blue = (sum(channel) // len(members) for channel in zip(*members, strict=True))
    return f"#{red:02x}{green:02x}{blue:02x}"


def crop_color(image: bytes) -> str:
    """The crop's dominant colour; neutral when Pillow is missing or the crop isn't an image.

    Pillow comes with the `vlm` group the real models need, so it is imported only here.
    """
    try:
        pil_image = importlib.import_module("PIL.Image")
        photo = pil_image.open(io.BytesIO(image)).convert("RGB")
    except (ImportError, OSError):
        return NEUTRAL
    photo.thumbnail((THUMBNAIL, THUMBNAIL))
    data = photo.tobytes()
    return dominant_color([(data[i], data[i + 1], data[i + 2]) for i in range(0, len(data), 3)])


def library_answer(reaction: dict[str, Any], image: bytes) -> dict[str, str]:
    answer = named_answer(reaction["object"]) or {
        "id": "other",
        "archetype": archetype_by_traits(reaction.get("traits", {})),
    }
    if answer["id"] != "other":
        return answer
    return {**answer, "color": crop_color(image)}


def match(model: ReactionModel, image: bytes) -> dict[str, Any]:
    """The reaction `model` gives to the crop `image`, which goes nowhere else, with the library
    answer for the object it names."""
    reaction = model.react(image)
    if not reaction.get("holding") or not isinstance(reaction.get("object"), str):
        return reaction
    return {**reaction, "prop": library_answer(reaction, image)}
