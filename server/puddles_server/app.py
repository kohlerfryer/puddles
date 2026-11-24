import base64
import json
import math
import os
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from puddles_server.brains import object_matcher
from puddles_server.models import ReactionModel, load_model
from puddles_server.saves import MAX_SAVE_BYTES, read_save, write_save

MAX_IMAGE_BYTES = 2 * 1024 * 1024
MAX_IMAGE_CHARS = 4 * math.ceil(MAX_IMAGE_BYTES / 3)
DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
MODEL_HEADER = "X-Puddles-Model"
LATENCY_HEADER = "X-Puddles-Latency-Ms"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.model = load_model(os.environ.get("PUDDLES_MODEL"))
    yield


app = FastAPI(title="Puddles server", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=DEV_ORIGINS,
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["Content-Type"],
    expose_headers=[MODEL_HEADER, LATENCY_HEADER],
)


class ReactRequest(BaseModel):
    image: str


def get_model(request: Request) -> ReactionModel:
    model: ReactionModel = request.app.state.model
    return model


def decode_image(image: str) -> bytes:
    if len(image) > MAX_IMAGE_CHARS:
        raise HTTPException(400, "image is over 2 MB")
    try:
        data = base64.b64decode(image, validate=True)
    except ValueError as error:
        raise HTTPException(400, "image is not base64") from error
    if not data:
        raise HTTPException(400, "image is empty")
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(400, "image is over 2 MB")
    return data


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/react")
def react(body: ReactRequest, model: Annotated[ReactionModel, Depends(get_model)]) -> JSONResponse:
    image = decode_image(body.image)
    start = time.perf_counter()
    try:
        status, content = 200, object_matcher.match(model, image)
    except Exception:
        status, content = 502, {"detail": "model failed"}
    latency_ms = round((time.perf_counter() - start) * 1000)
    headers = {MODEL_HEADER: model.name, LATENCY_HEADER: str(latency_ms)}
    return JSONResponse(content, status_code=status, headers=headers)


@app.get("/save")
def get_save() -> dict[str, Any]:
    return read_save()


@app.put("/save", status_code=204)
async def put_save(request: Request) -> Response:
    body = await request.body()
    if len(body) > MAX_SAVE_BYTES:
        raise HTTPException(413, "save is over 256 KB")
    try:
        save = json.loads(body)
    except ValueError as error:
        raise HTTPException(422, "save is not JSON") from error
    if not isinstance(save, dict):
        raise HTTPException(422, "save is not a JSON object")
    write_save(save)
    return Response(status_code=204)
