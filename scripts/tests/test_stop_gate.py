import io
import json
import subprocess
from pathlib import Path

import pytest

from scripts.agent_hooks import stop_gate
from scripts.agent_hooks.stop_gate import MAX_BLOCKS, decide

EVENT = {"session_id": "s1"}


def fake_subprocess(check_code: int, porcelain: str = " M x.py", ahead: str = "0") -> object:
    def run(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        outputs = {"status": porcelain, "rev-list": ahead, "check": "x.py:1: error: bad"}
        key = next(word for word in ("status", "rev-list", "check") if word in command)
        code = check_code if key == "check" else 0
        return subprocess.CompletedProcess(command, code, stdout=outputs[key], stderr="")

    return run


def test_lets_claude_stop_without_local_work(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(subprocess, "run", fake_subprocess(1, porcelain=""))

    assert decide(EVENT, tmp_path) is None


def test_lets_claude_stop_when_checks_pass(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(subprocess, "run", fake_subprocess(0, ahead="2"))

    assert decide(EVENT, tmp_path) is None


def test_blocks_while_checks_fail(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(subprocess, "run", fake_subprocess(1))

    reply = decide(EVENT, tmp_path)

    assert reply is not None
    assert reply["decision"] == "block"
    assert "x.py:1: error: bad" in reply["reason"]


def test_gives_up_after_max_blocks(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(subprocess, "run", fake_subprocess(1))
    for _ in range(MAX_BLOCKS):
        decide(EVENT, tmp_path)

    reply = decide(EVENT, tmp_path)

    assert reply is not None
    assert "decision" not in reply
    assert "needs-human" in reply["systemMessage"]
    assert not (tmp_path / "stop-blocks-s1").exists()


def test_main_prints_the_reply(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(stop_gate, "decide", lambda _event: {"decision": "block", "reason": "r"})
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(EVENT)))

    assert stop_gate.main() == 0
    assert json.loads(capsys.readouterr().out)["decision"] == "block"
