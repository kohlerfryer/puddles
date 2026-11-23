import base64
import binascii
import os
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from puddles_server.models import ReactionModel, load_model

MAX_IMAGE_BYTES = 2 * 1024 * 1024
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
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
    expose_headers=[MODEL_HEADER, LATENCY_HEADER],
)


class ReactRequest(BaseModel):
    image: str


def get_model(request: Request) -> ReactionModel:
    model: ReactionModel = request.app.state.model
    return model


def decode_image(image: str) -> bytes:
    try:
        data = base64.b64decode(image, validate=True)
    except binascii.Error as error:
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
        status, content = 200, model.react(image)
    except Exception:
        status, content = 502, {"detail": "model failed"}
    latency_ms = round((time.perf_counter() - start) * 1000)
    headers = {MODEL_HEADER: model.name, LATENCY_HEADER: str(latency_ms)}
    return JSONResponse(content, status_code=status, headers=headers)
