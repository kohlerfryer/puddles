import json
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator

from puddles_server.models import FakeModel
from scripts import bench_reactions
from scripts.bench_reactions import Result, main, percentile, photos, reply_text

GOOD = json.dumps(FakeModel().react(b""))


class RawModel:
    name = "raw"

    def __init__(self, replies: dict[bytes, str]) -> None:
        self.replies = replies

    def raw(self, image: bytes) -> str:
        return self.replies[image]

    def react(self, image: bytes) -> dict[str, Any]:
        raise AssertionError("the bench reads raw replies when a model has them")


def write_photos(folder: Path, names: dict[str, bytes]) -> None:
    for name, data in names.items():
        (folder / name).write_bytes(data)


def test_photos_keeps_images_in_name_order(tmp_path: Path) -> None:
    write_photos(tmp_path, {"b.PNG": b"", "a.jpg": b"", "notes.md": b"", "c.jpeg": b""})

    assert [path.name for path in photos(tmp_path)] == ["a.jpg", "b.PNG", "c.jpeg"]


def test_reply_text_prefers_the_raw_reply() -> None:
    assert reply_text(RawModel({b"x": "not json"}), b"x") == "not json"
    assert json.loads(reply_text(FakeModel(), b"x")) == FakeModel().react(b"x")


@pytest.mark.parametrize(
    ("share", "expected"), [(0.5, 20.0), (0.95, 40.0), (0.0, 10.0), (1.0, 40.0)]
)
def test_percentile_is_nearest_rank(share: float, expected: float) -> None:
    assert percentile([40.0, 10.0, 30.0, 20.0], share) == expected


def test_report_counts_valid_json_and_schema_valid_replies() -> None:
    validator = Draft202012Validator(json.loads(bench_reactions.SCHEMA_PATH.read_text()))
    results = [
        Result("good.jpg", GOOD, 0.1),
        Result("wrong.jpg", '{"holding": true}', 0.2),
        Result("list.jpg", "[]", 0.3),
        Result("broken.jpg", "{oops", 0.4),
    ]

    lines = bench_reactions.report(results, validator)

    assert lines[:5] == [
        "photos: 4",
        "valid JSON: 2/4 (50%)",
        "schema-valid: 1/4 (25%)",
        "latency p50: 200 ms, p95: 400 ms",
        "samples:",
    ]
    assert lines[5] == f"  good.jpg: {GOOD}"
    assert len(lines) == 9


def test_main_benches_the_configured_model(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    write_photos(tmp_path, {"cup.jpg": b"cup", "sock.jpg": b"sock"})
    model = RawModel({b"cup": GOOD, b"sock": "Quack!"})
    names: list[str | None] = []

    def load(name: str | None) -> RawModel:
        names.append(name)
        return model

    monkeypatch.setattr(bench_reactions, "load_model", load)
    monkeypatch.setenv("PUDDLES_MODEL", "smolvlm")

    assert main([str(tmp_path)]) == 0
    out = capsys.readouterr().out
    assert names == ["smolvlm"]
    assert "model: raw\nphotos: 2\nvalid JSON: 1/2 (50%)\nschema-valid: 1/2 (50%)" in out
    assert "  sock.jpg: Quack!" in out


def test_main_needs_one_folder_with_photos(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main([]) == 2
    assert main([str(tmp_path)]) == 1
    assert f"no photos in {tmp_path}" in capsys.readouterr().err
