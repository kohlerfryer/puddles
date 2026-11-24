import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from puddles_server.app import DEV_ORIGINS, app
from puddles_server.saves import MAX_SAVE_BYTES, SAVE_DIR_ENV, save_dir

SAVE = {"version": 1, "settings": {"mic": False}, "memory": {"facts": ["likes red"]}}


@pytest.fixture
def folder(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv(SAVE_DIR_ENV, str(tmp_path / "save"))
    return tmp_path / "save"


@pytest.fixture
def client(folder: Path) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


def test_save_is_empty_before_anything_is_stored(client: TestClient) -> None:
    response = client.get("/save")

    assert response.status_code == 200
    assert response.json() == {}


def test_stored_save_round_trips(client: TestClient) -> None:
    assert client.put("/save", json=SAVE).status_code == 204

    assert client.get("/save").json() == SAVE


def test_save_is_inspectable_json_in_the_save_folder(client: TestClient, folder: Path) -> None:
    client.put("/save", json=SAVE)

    text = (folder / "save.json").read_text()
    assert json.loads(text) == SAVE
    assert "\n  " in text


def test_a_new_save_replaces_the_old_one(client: TestClient) -> None:
    client.put("/save", json=SAVE)
    client.put("/save", json={"version": 1})

    assert client.get("/save").json() == {"version": 1}


def test_save_must_be_a_json_object(client: TestClient) -> None:
    assert client.put("/save", json=["not", "an", "object"]).status_code == 422


def test_oversized_save_is_refused(client: TestClient) -> None:
    big = {"memory": {"facts": ["x" * MAX_SAVE_BYTES]}}

    assert client.put("/save", json=big).status_code == 413
    assert client.get("/save").json() == {}


def test_unreadable_save_reads_as_empty(client: TestClient, folder: Path) -> None:
    folder.mkdir(parents=True)
    (folder / "save.json").write_text("{ not json")

    assert client.get("/save").json() == {}


def test_save_lives_under_puddles_in_home_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(SAVE_DIR_ENV, raising=False)

    assert save_dir() == Path.home() / "Puddles" / "save"


def test_save_must_be_json(client: TestClient) -> None:
    response = client.put(
        "/save", content=b"{ not json", headers={"Content-Type": "application/json"}
    )

    assert response.status_code == 422


def test_game_in_dev_may_store_the_save(client: TestClient) -> None:
    response = client.options(
        "/save",
        headers={
            "Origin": DEV_ORIGINS[0],
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )

    assert response.status_code == 200
