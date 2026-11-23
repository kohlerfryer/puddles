"""Base SmolVLM behind the ReactionModel interface.

torch, transformers, xgrammar and pillow live in the optional `vlm` dependency group,
so they are imported only when the model loads; the rest of the server never needs them.
"""

import copy
import importlib
import io
import json
import logging
import os
import re
from collections.abc import Callable
from pathlib import Path
from types import ModuleType
from typing import Any

SHARED = Path(__file__).resolve().parents[2] / "shared"
PROMPT_PATH = SHARED / "puddles_prompt.md"
SCHEMA_PATH = SHARED / "reaction.schema.json"
DEFAULT_MODEL_ID = "HuggingFaceTB/SmolVLM-256M-Instruct"
MAX_NEW_TOKENS = 384
# Caps for decoding only, so a rambling string can't run past MAX_NEW_TOKENS and cut the JSON.
MAX_OBJECT_CHARS = 40
MAX_SAY_CHARS = 80
REQUIRED_KEYS = ("holding", "object", "traits", "script")
TRAILING_COMMA = re.compile(r",\s*([}\]])")
STRING = re.compile(r'"(?:[^"\\]|\\.)*"')
# A whole string (maybe cut off before its closing quote) or one bracket.
TOKEN = re.compile(r'"(?:[^"\\]|\\.)*(?:"|\\?$)|[{}\[\]]')
# A reply cut off mid-escape: closing it with a quote would escape the quote.
LONE_BACKSLASH = re.compile(r"(?<!\\)(?:\\\\)*\\$")

# Mirrors the game's DEFAULT_SCRIPT: curious stands in for the missing "confused" mood.
CONFUSED_REACTION: dict[str, Any] = {
    "holding": True,
    "object": "something",
    "traits": {"size": "medium", "weight": "medium", "shape": "other", "edible": False},
    "script": [
        {"do": "sniff", "target": "object", "mood": "curious"},
        {"do": "look_at", "target": "camera", "mood": "curious", "say": "Hmm... what IS that?"},
    ],
}

Generate = Callable[[bytes], str]
LOG = logging.getLogger(__name__)


def build_messages(prompt: str) -> list[dict[str, Any]]:
    """The chat turn SmolVLM sees: the photo first, then Puddles' instructions."""
    return [{"role": "user", "content": [{"type": "image"}, {"type": "text", "text": prompt}]}]


def first_json_object(text: str) -> str | None:
    """The first {...} in text, closing any braces and brackets a cut-off reply left open."""
    start = text.find("{")
    if start == -1:
        return None
    closers: list[str] = []
    tail = ""
    for token in TOKEN.finditer(text, start):
        char = token.group()
        if char[0] == '"':
            tail = "" if STRING.fullmatch(char) else '"'
        elif char in "{[":
            closers.append("}" if char == "{" else "]")
        else:
            closers.pop()
            if not closers:
                return text[start : token.end()]
    return close_string(text[start:], tail) + "".join(reversed(closers))


def close_string(body: str, tail: str) -> str:
    """Add the missing quote, dropping a lone backslash that would escape it."""
    if tail and LONE_BACKSLASH.search(body):
        body = body[:-1]
    return body + tail


def parse_reaction(text: str) -> dict[str, Any]:
    """The reaction in a model reply, repaired if it can be, else the confused reaction."""
    candidate = first_json_object(text)
    if candidate is not None:
        try:
            data = json.loads(TRAILING_COMMA.sub(r"\1", candidate))
        except json.JSONDecodeError:
            data = None
        if isinstance(data, dict) and all(key in data for key in REQUIRED_KEYS):
            return data
    return copy.deepcopy(CONFUSED_REACTION)


def pick_device(torch: ModuleType) -> str:
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def load_generator(model_id: str, prompt: str) -> Generate:
    """Load SmolVLM and return a function from JPEG bytes to the model's reply text."""
    torch = importlib.import_module("torch")
    transformers = importlib.import_module("transformers")
    pil_image = importlib.import_module("PIL.Image")
    device = pick_device(torch)
    processor = transformers.AutoProcessor.from_pretrained(model_id)
    model = transformers.AutoModelForImageTextToText.from_pretrained(model_id).to(device)
    text = processor.apply_chat_template(build_messages(prompt), add_generation_prompt=True)
    schema_processors = constrain(model, processor)

    def generate(image: bytes) -> str:
        photo = pil_image.open(io.BytesIO(image)).convert("RGB")
        inputs = processor(text=text, images=[photo], return_tensors="pt").to(device)
        output = model.generate(
            **inputs,
            max_new_tokens=MAX_NEW_TOKENS,
            do_sample=False,
            logits_processor=schema_processors(),
        )
        reply = output[:, inputs["input_ids"].shape[1] :]
        return str(processor.batch_decode(reply, skip_special_tokens=True)[0])

    return generate


def decoding_schema() -> dict[str, Any]:
    """The shared reaction schema with string lengths capped to fit the token budget."""
    schema: dict[str, Any] = json.loads(SCHEMA_PATH.read_text())
    schema["properties"]["object"]["maxLength"] = MAX_OBJECT_CHARS
    schema["$defs"]["Step"]["properties"]["say"]["maxLength"] = MAX_SAY_CHARS
    return schema


def constrain(model: Any, processor: Any) -> Callable[[], list[Any]]:
    """Fresh logits processors per reply that allow only schema-valid JSON.

    They are stateful, hence one set per reply. If xgrammar can't compile the schema for this
    model's tokenizer, there are none and the model generates freely.
    """
    try:
        xgrammar = importlib.import_module("xgrammar")
        xgrammar_hf = importlib.import_module("xgrammar.contrib.hf")
        vocab_size = model.config.text_config.vocab_size
        info = xgrammar.TokenizerInfo.from_huggingface(processor.tokenizer, vocab_size=vocab_size)
        compiler = xgrammar.GrammarCompiler(info)
        grammar = compiler.compile_json_schema(decoding_schema(), any_whitespace=False)
    except Exception:
        LOG.warning("constrained decoding is off for this model", exc_info=True)
        return list
    return lambda: [xgrammar_hf.LogitsProcessor(grammar)]


class SmolVLMModel:
    """Base SmolVLM; the model id comes from PUDDLES_SMOLVLM_ID."""

    name = "smolvlm"

    def __init__(self) -> None:
        self.model_id = os.environ.get("PUDDLES_SMOLVLM_ID") or DEFAULT_MODEL_ID
        self.generate = load_generator(self.model_id, PROMPT_PATH.read_text())

    def raw(self, image: bytes) -> str:
        """The model's reply text before repair, for the benchmark."""
        return self.generate(image)

    def react(self, image: bytes) -> dict[str, Any]:
        return parse_reaction(self.raw(image))
