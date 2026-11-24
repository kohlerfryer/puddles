import json
from pathlib import Path
from typing import Any

import pytest

from scripts import cassettes
from scripts.cassettes import digest, drift, main, record, replayer


class RawModel:
    name = "raw"
    model_id = "test/raw-1"

    def __init__(self, replies: dict[bytes, str]) -> None:
        self.replies = replies

    def raw(self, image: bytes) -> str:
        return self.replies[image]

    def react(self, image: bytes) -> dict[str, Any]:
        raise AssertionError("cassettes record the raw reply")


@pytest.fixture
def folders(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A folder of two photos and an empty cassette folder, standing in for the repo's."""
    photos = tmp_path / "photos"
    photos.mkdir()
    (photos / "cup.jpg").write_bytes(b"cup")
    (photos / "sock.jpg").write_bytes(b"sock")
    (photos / "SOURCES.md").write_text("not a photo")
    monkeypatch.setattr(cassettes, "PHOTOS", photos)
    monkeypatch.setattr(cassettes, "CASSETTES", tmp_path / "cassettes")
    return tmp_path


def use_model(monkeypatch: pytest.MonkeyPatch, model: RawModel) -> list[str]:
    names: list[str] = []

    def load(name: str) -> RawModel:
        names.append(name)
        return model

    monkeypatch.setattr(cassettes, "load_model", load)
    return names


def test_records_each_photos_raw_reply_with_its_hash(folders: Path) -> None:
    cassette = record(RawModel({b"cup": "a cup", b"sock": "a sock"}), cassettes.PHOTOS)

    assert cassette == {
        "model": "raw",
        "model_id": "test/raw-1",
        "replies": {
            "cup.jpg": {"sha256": digest(b"cup"), "reply": "a cup"},
            "sock.jpg": {"sha256": digest(b"sock"), "reply": "a sock"},
        },
    }


def test_replays_the_recorded_reply_for_the_same_photo(folders: Path) -> None:
    generate = replayer(record(RawModel({b"cup": "a cup", b"sock": "a sock"}), cassettes.PHOTOS))

    assert generate(b"sock") == "a sock"
    with pytest.raises(KeyError, match="not in the cassette; re-record it"):
        generate(b"a photo nobody recorded")


def test_drift_lists_changed_new_and_missing_replies() -> None:
    old = {"replies": {"cup.jpg": {"reply": "a cup"}, "hat.jpg": {"reply": "a hat"}}}
    new = {"replies": {"cup.jpg": {"reply": "a mug"}, "sock.jpg": {"reply": "a sock"}}}

    assert drift(old, new) == [
        "cup.jpg: 'a cup' -> 'a mug'",
        "hat.jpg: 'a hat' -> no reply",
        "sock.jpg: no reply -> 'a sock'",
    ]
    assert drift(old, old) == []


def test_record_writes_the_cassette_the_brain_tests_read(
    folders: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    names = use_model(monkeypatch, RawModel({b"cup": "a cup", b"sock": "a sock"}))

    assert main(["record", "smolvlm"]) == 0

    written = cassettes.path_for("smolvlm")
    assert names == ["smolvlm"]
    assert written == folders / "cassettes" / "smolvlm.json"
    assert json.loads(written.read_text())["replies"]["cup.jpg"]["reply"] == "a cup"
    assert written.read_text().endswith("}\n")
    assert f"recorded 2 replies to {written}" in capsys.readouterr().out


def test_drift_passes_while_the_model_still_gives_the_recorded_replies(
    folders: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    use_model(monkeypatch, RawModel({b"cup": "a cup", b"sock": "a sock"}))
    main(["record", "smolvlm"])

    assert main(["drift", "smolvlm"]) == 0
    assert "no drift: 2 replies match" in capsys.readouterr().out


def test_drift_fails_and_lists_the_replies_that_changed(
    folders: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    use_model(monkeypatch, RawModel({b"cup": "a cup", b"sock": "a sock"}))
    main(["record", "smolvlm"])
    use_model(monkeypatch, RawModel({b"cup": "a mug", b"sock": "a sock"}))

    assert main(["drift", "smolvlm"]) == 1
    out = capsys.readouterr().out
    assert "1 of 2 replies drifted from" in out
    assert "  cup.jpg: 'a cup' -> 'a mug'" in out


@pytest.mark.parametrize("argv", [[], ["record"], ["replay", "smolvlm"]])
def test_main_needs_an_action_and_a_model(
    argv: list[str], capsys: pytest.CaptureFixture[str]
) -> None:
    assert main(argv) == 2
    assert "usage: cassettes record|drift <model>" in capsys.readouterr().err
