"""Turn an object's name into a Puddles reaction, for models that can only name things.

The base SmolVLM can name what it sees but can't write a full reaction. This module sorts a
name into a kind of object and fills a reaction template for that kind. The fine-tuned model
replaces this with reactions it writes itself; this is also the baseline it must beat.
"""

import random
import re
from typing import Any

KIND_WORDS: dict[str, tuple[str, ...]] = {
    "food": (
        "apple",
        "banana",
        "fruit",
        "orange",
        "bread",
        "cereal",
        "cookie",
        "cracker",
        "carrot",
        "grape",
        "pear",
        "cheese",
        "sandwich",
        "snack",
        "berry",
        "strawberry",
        "pea",
        "corn",
    ),
    "animal": (
        "cat",
        "dog",
        "dinosaur",
        "bear",
        "teddy",
        "duck",
        "bird",
        "lion",
        "tiger",
        "frog",
        "fish",
        "horse",
        "rabbit",
        "bunny",
        "monkey",
        "elephant",
        "unicorn",
        "plush",
    ),
    "wearable": (
        "hat",
        "cap",
        "shoe",
        "sneaker",
        "boot",
        "sock",
        "glove",
        "scarf",
        "crown",
        "helmet",
        "glasses",
        "bow",
    ),
    "flat": ("book", "pillow", "cushion", "plate", "towel", "blanket", "paper", "drawing", "card"),
    "round": ("ball", "orange", "globe", "balloon", "marble"),
    "vehicle": ("car", "truck", "train", "plane", "boat", "bus", "rocket", "tractor"),
    "container": ("cup", "mug", "bowl", "bottle", "box", "jar", "pot", "basket"),
}
KIND_ORDER = ("food", "animal", "vehicle", "wearable", "round", "flat", "container")

TRAITS: dict[str, dict[str, Any]] = {
    "food": {"size": "small", "weight": "light", "shape": "other", "edible": True},
    "animal": {"size": "small", "weight": "light", "shape": "other", "edible": False},
    "wearable": {"size": "small", "weight": "light", "shape": "other", "edible": False},
    "flat": {"size": "medium", "weight": "light", "shape": "flat", "edible": False},
    "round": {"size": "small", "weight": "light", "shape": "round", "edible": False},
    "vehicle": {"size": "small", "weight": "medium", "shape": "other", "edible": False},
    "container": {"size": "small", "weight": "medium", "shape": "other", "edible": False},
    "other": {"size": "small", "weight": "medium", "shape": "other", "edible": False},
}


def step(do: str, mood: str, target: str = "object", say: str | None = None) -> dict[str, str]:
    result = {"do": do, "target": target, "mood": mood}
    if say:
        result["say"] = say
    return result


SCRIPTS: dict[str, list[list[dict[str, str]]]] = {
    "food": [
        [
            step("walk_to", "curious"),
            step("sniff", "curious", say="Is that {a_name}?!"),
            step("eat", "happy", say="Crunchy! More please!"),
        ],
        [
            step("run_to", "happy", say="Snack time!"),
            step("peck", "happy"),
            step("eat", "happy"),
            step("dance", "happy", "none"),
        ],
    ],
    "animal": [
        [
            step("freeze", "scared", say="Is that... {a_name}?"),
            step("run_away", "scared"),
            step("hide_behind", "scared", "reeds", "Nope nope nope."),
        ],
        [
            step("look_at", "curious"),
            step("circle", "curious", say="A new friend?"),
            step("dance", "happy", "none", "Hello, {name}!"),
        ],
    ],
    "wearable": [
        [
            step("walk_to", "curious"),
            step("wear", "proud", say="Do I look fancy?"),
            step("dance", "proud", "none"),
        ],
    ],
    "flat": [
        [
            step("circle", "curious"),
            step("sit_on", "proud", say="My {name} throne!"),
            step("look_at", "proud", "camera"),
        ],
    ],
    "round": [
        [
            step("walk_to", "curious"),
            step("push", "happy", say="Roll, {name}, roll!"),
            step("run_to", "happy"),
        ],
    ],
    "vehicle": [
        [
            step("look_at", "curious", say="Vroom vroom?"),
            step("jump_over", "silly"),
            step("dance", "happy", "none", "Again! Again!"),
        ],
    ],
    "container": [
        [
            step("walk_to", "curious"),
            step("sniff", "curious", say="Anything in that {name}?"),
            step("wear", "silly", say="A hat, obviously."),
        ],
    ],
    "other": [
        [
            step("sniff", "curious"),
            step("look_at", "curious", "camera", "What IS {a_name}?"),
            step("peck", "silly"),
        ],
        [step("circle", "curious"), step("fall_over", "silly", say="{A_name}! Too exciting!")],
    ],
}


def clean_name(raw: str) -> str:
    words = re.findall(r"[a-zA-Z][a-zA-Z'-]*", raw.lower())[:3]
    return " ".join(words) or "thing"


def kind_of(name: str) -> str:
    words = set(name.split())
    words |= {w.removesuffix("s") for w in words}
    for kind in KIND_ORDER:
        if words & set(KIND_WORDS[kind]):
            return kind
    return "other"


def reaction_for(raw_name: str, rng: random.Random) -> dict[str, Any]:
    """A full reaction for an object the model could only name."""
    name = clean_name(raw_name)
    kind = kind_of(name)
    script = rng.choice(SCRIPTS[kind])
    a_name = ("an " if name[0] in "aeiou" else "a ") + name
    words = {"name": name, "a_name": a_name, "A_name": a_name.capitalize()}
    filled = [{k: v.format(**words) for k, v in s.items()} for s in script]
    return {"holding": True, "object": name, "traits": dict(TRAITS[kind]), "script": filled}
