import base64
import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from puddles_server.app import app, get_model
from puddles_server.models import FakeModel, load_model

SCHEMA = json.loads((Path(__file__).parents[2] / "shared" / "reaction.schema.json").read_text())
JPEG = b"\xff\xd8\xff\xe0 not really a jpeg"


def encode(data: bytes) -> str:
    return base64.b64encode(data).decode()


class FailingModel:
    name = "failing"

    def react(self, image: bytes) -> dict[str, Any]:
        raise RuntimeError("weights missing")


class RecordingModel:
    name = "recording"

    def __init__(self) -> None:
        self.images: list[bytes] = []

    def react(self, image: bytes) -> dict[str, Any]:
        self.images.append(image)
        return {"holding": False}


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_react_returns_the_fake_reaction_by_default(client: TestClient) -> None:
    response = client.post("/react", json={"image": encode(JPEG)})

    assert response.status_code == 200
    assert response.json() == FakeModel().react(JPEG)


def test_react_passes_the_decoded_image_to_the_model(client: TestClient) -> None:
    model = RecordingModel()
    app.dependency_overrides[get_model] = lambda: model

    response = client.post("/react", json={"image": encode(JPEG)})

    assert response.json() == {"holding": False}
    assert model.images == [JPEG]


def test_react_reports_model_and_latency_headers(client: TestClient) -> None:
    response = client.post("/react", json={"image": encode(JPEG)})

    assert response.headers["X-Puddles-Model"] == "fake"
    assert int(response.headers["X-Puddles-Latency-Ms"]) >= 0


@pytest.mark.parametrize(
    "image",
    [
        pytest.param("not base64!", id="not-base64"),
        pytest.param("", id="empty"),
        pytest.param(encode(b"\0" * (2 * 1024 * 1024 + 1)), id="over-2mb"),
    ],
)
def test_react_rejects_bad_images(client: TestClient, image: str) -> None:
    response = client.post("/react", json={"image": image})

    assert response.status_code == 400


def test_react_accepts_an_image_of_exactly_2mb(client: TestClient) -> None:
    response = client.post("/react", json={"image": encode(b"\0" * (2 * 1024 * 1024))})

    assert response.status_code == 200


def test_react_returns_502_when_the_model_fails(client: TestClient) -> None:
    app.dependency_overrides[get_model] = FailingModel

    response = client.post("/react", json={"image": encode(JPEG)})

    assert response.status_code == 502
    assert response.json() == {"detail": "model failed"}
    assert response.headers["X-Puddles-Model"] == "failing"


@pytest.mark.parametrize("origin", ["http://localhost:5173", "http://127.0.0.1:5173"])
def test_cors_preflight_allows_vite_dev_origins(client: TestClient, origin: str) -> None:
    response = client.options(
        "/react",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Origin"] == origin


def test_cors_exposes_the_eval_headers(client: TestClient) -> None:
    response = client.post(
        "/react", json={"image": encode(JPEG)}, headers={"Origin": "http://localhost:5173"}
    )

    exposed = response.headers["Access-Control-Expose-Headers"].lower()
    assert "x-puddles-model" in exposed
    assert "x-puddles-latency-ms" in exposed


def test_cors_preflight_rejects_other_origins(client: TestClient) -> None:
    response = client.options(
        "/react",
        headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "POST"},
    )

    assert "Access-Control-Allow-Origin" not in response.headers


def test_model_is_chosen_by_env_var(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PUDDLES_MODEL", "fake")

    with TestClient(app) as test_client:
        response = test_client.post("/react", json={"image": encode(JPEG)})

    assert response.headers["X-Puddles-Model"] == "fake"


def test_unknown_model_name_fails_at_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PUDDLES_MODEL", "nope")

    with pytest.raises(ValueError, match="nope"), TestClient(app):
        pass


def test_load_model_defaults_to_fake() -> None:
    assert isinstance(load_model(None), FakeModel)


def test_fake_reaction_fits_the_shared_schema() -> None:
    reaction = FakeModel().react(JPEG)
    defs = SCHEMA["$defs"]

    assert set(reaction) == set(SCHEMA["required"])
    assert isinstance(reaction["holding"], bool)
    assert reaction["object"]
    traits = reaction["traits"]
    assert traits["size"] in defs["Size"]["enum"]
    assert traits["weight"] in defs["Weight"]["enum"]
    assert traits["shape"] in defs["Shape"]["enum"]
    assert isinstance(traits["edible"], bool)
    assert 2 <= len(reaction["script"]) <= 5
    for step in reaction["script"]:
        assert set(step) <= set(defs["Step"]["properties"])
        assert step["do"] in defs["Verb"]["enum"]
        assert step["mood"] in defs["Mood"]["enum"]
        assert step.get("target", "none") in defs["Target"]["enum"]
