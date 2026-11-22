"""Shared input and output helpers for Claude Code hooks."""

import json
import os
import sys
from typing import Any

CI_AGENT_ENV = "PUDDLES_AGENT"


def read_event() -> dict[str, Any]:
    raw = sys.stdin.read()
    event: dict[str, Any] = json.loads(raw) if raw.strip() else {}
    return event


def is_ci_agent() -> bool:
    """True inside the GitHub Actions agent workflows, which set PUDDLES_AGENT=ci."""
    return os.environ.get(CI_AGENT_ENV) == "ci"


def tail(text: str, lines: int = 40) -> str:
    return "\n".join(text.strip().splitlines()[-lines:])
