"""Recorded model replies (cassettes), so brain tests run without a GPU (spec §14.1).

A cassette holds a real model's raw reply to each bench photo, with the photo's SHA-256 so a changed
photo is noticed. Brain tests replay it in place of the model; this script records it and checks
the real model still gives the recorded replies, which is the drift the nightly job reports.

    PYTHONPATH=server uv run --group vlm python -m scripts.cassettes record smolvlm
    PYTHONPATH=server uv run --group vlm python -m scripts.cassettes drift smolvlm

Re-record after changing a model, its prompt or the photos. `drift` exits 1 and lists each reply
that changed. Both need the `vlm` group and run the model on whatever device it finds.
"""

import hashlib
import json
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

from puddles_server.models import ReactionModel, load_model
from scripts.bench_reactions import photos, reply_text

ROOT = Path(__file__).resolve().parents[1]
PHOTOS = ROOT / "ml" / "bench" / "photos"
CASSETTES = ROOT / "server" / "tests" / "cassettes"
ACTIONS = ("record", "drift")

Cassette = dict[str, Any]


def digest(image: bytes) -> str:
    return hashlib.sha256(image).hexdigest()


def path_for(model: str) -> Path:
    return CASSETTES / f"{model}.json"


def record(model: ReactionModel, folder: Path) -> Cassette:
    """The model's raw reply to each photo in `folder`, by file name."""
    replies = {}
    for path in photos(folder):
        image = path.read_bytes()
        replies[path.name] = {"sha256": digest(image), "reply": reply_text(model, image)}
    return {"model": model.name, "model_id": getattr(model, "model_id", None), "replies": replies}


def replayer(cassette: Cassette) -> Callable[[bytes], str]:
    """A stand-in for a model's generator that gives the recorded reply to each recorded photo."""
    replies = {entry["sha256"]: entry["reply"] for entry in cassette["replies"].values()}

    def generate(image: bytes) -> str:
        key = digest(image)
        if key not in replies:
            raise KeyError(f"photo {key[:12]} is not in the cassette; re-record it")
        return str(replies[key])

    return generate


def drift(old: Cassette, new: Cassette) -> list[str]:
    """A line for each photo whose reply differs between the two cassettes."""
    before, after = old["replies"], new["replies"]

    def said(replies: dict[str, Any], photo: str) -> str:
        return repr(replies[photo]["reply"]) if photo in replies else "no reply"

    return [
        f"{photo}: {said(before, photo)} -> {said(after, photo)}"
        for photo in sorted(before.keys() | after.keys())
        if said(before, photo) != said(after, photo)
    ]


def main(argv: list[str]) -> int:
    if len(argv) != len(ACTIONS) or argv[0] not in ACTIONS:
        print("usage: cassettes record|drift <model>", file=sys.stderr)
        return 2
    action, name = argv
    path = path_for(name)
    fresh = record(load_model(name), PHOTOS)
    if action == "record":
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(fresh, indent=2) + "\n")
        print(f"recorded {len(fresh['replies'])} replies to {path}")
        return 0
    changed = drift(json.loads(path.read_text()), fresh)
    if not changed:
        print(f"no drift: {len(fresh['replies'])} replies match {path}")
        return 0
    print(f"{len(changed)} of {len(fresh['replies'])} replies drifted from {path}:")
    print("\n".join(f"  {line}" for line in changed))
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
