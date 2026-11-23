from typing import Any, Protocol


class ReactionModel(Protocol):
    name: str

    def react(self, image: bytes) -> dict[str, Any]: ...


class FakeModel:
    """A fixed, valid reaction for tests and offline dev."""

    name = "fake"

    def react(self, image: bytes) -> dict[str, Any]:
        return {
            "holding": True,
            "object": "rubber duck",
            "traits": {"size": "small", "weight": "light", "shape": "round", "edible": False},
            "script": [
                {"do": "look_at", "target": "object", "mood": "curious", "say": "Who is that?"},
                {"do": "dance", "target": "none", "mood": "happy", "say": "A friend!"},
            ],
        }


MODELS: dict[str, type[ReactionModel]] = {"fake": FakeModel}


def load_model(name: str | None) -> ReactionModel:
    name = name or "fake"
    if name not in MODELS:
        raise ValueError(f"unknown PUDDLES_MODEL {name!r}; choose from {sorted(MODELS)}")
    return MODELS[name]()
