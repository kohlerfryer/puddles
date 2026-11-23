import sys
from types import ModuleType, SimpleNamespace
from typing import Any

import pytest

from puddles_server import smolvlm
from puddles_server.smolvlm import pick_device


def fake_torch(*, mps: bool = False, cuda: bool = False) -> Any:
    return SimpleNamespace(
        backends=SimpleNamespace(mps=SimpleNamespace(is_available=lambda: mps)),
        cuda=SimpleNamespace(is_available=lambda: cuda),
    )


@pytest.mark.parametrize(
    ("mps", "cuda", "device"),
    [(True, True, "mps"), (False, True, "cuda"), (False, False, "cpu")],
)
def test_pick_device_prefers_mps_then_cuda(mps: bool, cuda: bool, device: str) -> None:
    assert pick_device(fake_torch(mps=mps, cuda=cuda)) == device


class FakeTensor:
    def __init__(self, label: str) -> None:
        self.label = label
        self.shape = (1, 7)

    def __getitem__(self, key: tuple[slice, slice]) -> str:
        return f"{self.label}[{key[1].start}:]"


class FakeInputs(dict[str, Any]):
    def to(self, device: str) -> "FakeInputs":
        self["device"] = device
        return self


class FakeProcessor:
    tokenizer = "tokenizer"

    def apply_chat_template(self, messages: Any, add_generation_prompt: bool) -> str:
        assert add_generation_prompt
        return f"CHAT({messages[0]['content'][1]['text'][:9]})"

    def __call__(self, text: str, images: list[Any], return_tensors: str) -> FakeInputs:
        assert return_tensors == "pt"
        return FakeInputs(input_ids=FakeTensor("ids"), text=text, images=images)

    def batch_decode(self, reply: str, skip_special_tokens: bool) -> list[str]:
        assert skip_special_tokens
        return [f"decoded {reply}"]


class FakeVLM:
    def __init__(self) -> None:
        self.device = ""
        self.config = SimpleNamespace(text_config=SimpleNamespace(vocab_size=99))
        self.logits_processors: list[Any] = []

    def to(self, device: str) -> "FakeVLM":
        self.device = device
        return self

    def generate(self, **inputs: Any) -> FakeTensor:
        assert inputs["max_new_tokens"] == smolvlm.MAX_NEW_TOKENS
        assert not inputs["do_sample"]
        self.logits_processors.append(inputs["logits_processor"])
        return FakeTensor(f"out({inputs['text']},{inputs['images'][0]},{inputs['device']})")


class FakePhoto:
    def __init__(self, data: bytes) -> None:
        self.data = data

    def convert(self, mode: str) -> "FakePhoto":
        return FakePhoto(self.data + f"/{mode}".encode())

    def __str__(self) -> str:
        return self.data.decode()


def install_fakes(monkeypatch: pytest.MonkeyPatch, xgrammar: ModuleType) -> FakeVLM:
    vlm = FakeVLM()
    auto = SimpleNamespace
    fakes = {
        "torch": module("torch", **vars(fake_torch(cuda=True))),
        "transformers": module(
            "transformers",
            AutoProcessor=auto(from_pretrained=lambda model_id: FakeProcessor()),
            AutoModelForImageTextToText=auto(from_pretrained=lambda model_id: vlm),
        ),
        "PIL.Image": module("PIL.Image", open=lambda stream: FakePhoto(stream.read())),
        "xgrammar": xgrammar,
        "xgrammar.contrib.hf": module("xgrammar.contrib.hf", LogitsProcessor=FakeLogitsProcessor),
    }
    for name, fake in fakes.items():
        monkeypatch.setitem(sys.modules, name, fake)
    return vlm


class FakeLogitsProcessor:
    def __init__(self, grammar: str) -> None:
        self.grammar = grammar


class FakeCompiler:
    def __init__(self, info: tuple[Any, int]) -> None:
        self.info = info

    def compile_json_schema(self, schema: dict[str, Any], any_whitespace: bool) -> str:
        assert not any_whitespace
        assert schema == smolvlm.decoding_schema()
        return f"grammar({self.info[1]})"


def schema_xgrammar() -> ModuleType:
    def tokenizer_info(tokenizer: Any, vocab_size: int) -> tuple[Any, int]:
        return tokenizer, vocab_size

    return module(
        "xgrammar",
        TokenizerInfo=SimpleNamespace(from_huggingface=tokenizer_info),
        GrammarCompiler=FakeCompiler,
    )


def test_loader_decodes_under_the_schema_with_fresh_processors_per_reply(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    vlm = install_fakes(monkeypatch, schema_xgrammar())

    generate = smolvlm.load_generator("some/model", "You are Puddles")
    replies = [generate(b"jpeg"), generate(b"png")]

    assert replies == [
        "decoded out(CHAT(You are P),jpeg/RGB,cuda)[7:]",
        "decoded out(CHAT(You are P),png/RGB,cuda)[7:]",
    ]
    assert vlm.device == "cuda"
    first, second = vlm.logits_processors
    assert [processor.grammar for processor in first + second] == ["grammar(99)"] * 2
    assert first[0] is not second[0]


def test_loader_generates_freely_when_xgrammar_cannot_compile(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    vlm = install_fakes(monkeypatch, module("xgrammar"))

    generate = smolvlm.load_generator("some/model", "You are Puddles")

    assert generate(b"jpeg") == "decoded out(CHAT(You are P),jpeg/RGB,cuda)[7:]"
    assert vlm.logits_processors == [[]]
    assert "constrained decoding is off for this model" in caplog.text


def module(name: str, **attributes: Any) -> ModuleType:
    fake = ModuleType(name)
    fake.__dict__.update(attributes)
    return fake
