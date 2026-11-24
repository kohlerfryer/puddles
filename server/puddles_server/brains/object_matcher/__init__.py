"""The object matcher brain (spec §8), server half: the only brain that sees the held-up crop.

`/react` is its endpoint. It hands the crop to the `ReactionModel` the server runs, which stays in
`models.py`, `smolvlm.py` and `templates.py`; the game logs the reply as `observation.object`, and
the brain's game half turns it into a routine.
"""

import json
from pathlib import Path
from typing import Any

from puddles_server.models import ReactionModel

MANIFEST: dict[str, Any] = json.loads((Path(__file__).parent / "manifest.json").read_text())


def match(model: ReactionModel, image: bytes) -> dict[str, Any]:
    """The reaction `model` gives to the crop `image`, which goes nowhere else."""
    return model.react(image)
