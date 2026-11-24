"""Run the configured reaction model over a folder of photos and report how it does.

Prints the valid-JSON rate, the schema-valid rate, how often the object is named right and lands
on the right library prop (when the folder's SOURCES.md lists what each photo shows), latency
p50/p95 and a few replies.
Run with `just bench-vlm <folder>`; the model comes from PUDDLES_MODEL like the server's.
"""

import json
import math
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from puddles_server.brains import object_matcher
from puddles_server.models import ReactionModel, load_model

SCHEMA_PATH = Path(__file__).resolve().parents[1] / "shared" / "reaction.schema.json"
PHOTO_SUFFIXES = {".jpg", ".jpeg", ".png"}
SAMPLES = 5
# Words that don't identify an object, and names a model may fairly use instead.
GENERIC = frozenset({"toy", "fruit", "cover", "plush", "coffee", "baseball", "water", "wooden"})
SYNONYMS = {"sneaker": {"shoe"}, "mug": {"cup"}, "cap": {"hat"}}


@dataclass(frozen=True)
class Result:
    photo: str
    reply: str
    seconds: float


def photos(folder: Path) -> list[Path]:
    return sorted(path for path in folder.iterdir() if path.suffix.lower() in PHOTO_SUFFIXES)


def reply_text(model: ReactionModel, image: bytes) -> str:
    """The model's raw reply when it exposes one, so repairs don't hide bad output."""
    raw = getattr(model, "raw", None)
    return str(raw(image)) if callable(raw) else json.dumps(model.react(image))


def run(model: ReactionModel, paths: list[Path]) -> list[Result]:
    results = []
    for path in paths:
        image = path.read_bytes()
        start = time.perf_counter()
        reply = reply_text(model, image)
        results.append(Result(path.name, reply, time.perf_counter() - start))
    return results


def expected_objects(folder: Path) -> dict[str, str]:
    """Photo file -> object, from the `| file | object | ...` rows of the folder's SOURCES.md."""
    sources = folder / "SOURCES.md"
    if not sources.exists():
        return {}
    expected = {}
    for line in sources.read_text().splitlines():
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if len(cells) > 1 and Path(cells[0]).suffix.lower() in PHOTO_SUFFIXES:
            expected[cells[0]] = cells[1]
    return expected


def words(text: str) -> set[str]:
    """Lowercase words without a plural s, so "Crayons" and "crayon" match."""
    return {word.removesuffix("s") for word in re.findall(r"[a-z]+", text.lower())}


def said_name(reply: Any) -> str:
    """A JSON reply's `object`; any other reply is taken as the model's name answer."""
    return str(reply.get("object", "")) if isinstance(reply, dict) else str(reply)


def names_object(reply: Any, expected: str) -> bool:
    """Whether the reply names what the photo shows: a shared word or a synonym."""
    said = words(said_name(reply))
    wanted = words(expected) - GENERIC or words(expected)
    accepted = wanted.union(*(SYNONYMS.get(word, set()) for word in wanted))
    return bool(said & accepted)


def matches_library(reply: Any, expected: str) -> bool:
    """Whether the object matcher spawns the library prop the photo shows for the reply's name."""
    wanted = object_matcher.prop_named(expected)
    return wanted is not None and object_matcher.prop_named(said_name(reply)) == wanted


def parsed(reply: str) -> Any:
    try:
        return json.loads(reply)
    except json.JSONDecodeError:
        return None


def percentile(values: list[float], share: float) -> float:
    """Nearest-rank percentile, so small benches report a latency that really happened."""
    ranked = sorted(values)
    return ranked[max(math.ceil(share * len(ranked)) - 1, 0)]


def report(
    results: list[Result], validator: Draft202012Validator, expected: dict[str, str]
) -> list[str]:
    replies = [parsed(result.reply) for result in results]
    valid_json = sum(isinstance(reply, dict) for reply in replies)
    schema_valid = sum(reply is not None and validator.is_valid(reply) for reply in replies)
    millis = [result.seconds * 1000 for result in results]
    count = len(results)
    lines = [
        f"photos: {count}",
        f"valid JSON: {valid_json}/{count} ({valid_json / count:.0%})",
        f"schema-valid: {schema_valid}/{count} ({schema_valid / count:.0%})",
        *object_line(results, replies, expected),
        f"latency p50: {percentile(millis, 0.5):.0f} ms, p95: {percentile(millis, 0.95):.0f} ms",
        "samples:",
    ]
    lines += [f"  {result.photo}: {result.reply}" for result in results[:SAMPLES]]
    return lines


def object_line(results: list[Result], replies: list[Any], expected: dict[str, str]) -> list[str]:
    known = [
        (r.reply if reply is None else reply, expected[r.photo])
        for r, reply in zip(results, replies, strict=True)
        if r.photo in expected
    ]
    if not known:
        return []
    right = sum(names_object(reply, wanted) for reply, wanted in known)
    library = sum(matches_library(reply, wanted) for reply, wanted in known)
    return [
        f"object named right: {right}/{len(known)} ({right / len(known):.0%})",
        f"library match: {library}/{len(known)} ({library / len(known):.0%})",
    ]


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: bench_reactions <photo folder>", file=sys.stderr)
        return 2
    paths = photos(Path(argv[0]))
    if not paths:
        print(f"no photos in {argv[0]}", file=sys.stderr)
        return 1
    model = load_model(os.environ.get("PUDDLES_MODEL"))
    print(f"model: {model.name}")
    validator = Draft202012Validator(json.loads(SCHEMA_PATH.read_text()))
    expected = expected_objects(Path(argv[0]))
    print("\n".join(report(run(model, paths), validator, expected)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
