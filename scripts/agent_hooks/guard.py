"""PreToolUse hook: deny commands and edits that would bypass the workflow's gates."""

import json
import re
import subprocess
from pathlib import PurePosixPath
from typing import Any

from scripts.agent_hooks.hook_io import is_ci_agent, read_event

FORCE_PUSH = re.compile(r"\bgit\s+push\b.*\s(--force(-with-lease)?|-f)\b")
PUSH_TO_MAIN = re.compile(r"\bgit\s+push\b.*(\smain\b|:main\b)")
BARE_PUSH = re.compile(r"\bgit\s+push\s*($|&|;|\|)")
NO_VERIFY = re.compile(r"\bgit\s+(commit|push)\b.*\s(--no-verify|-n)\b")
PR_MERGE = re.compile(r"\bgh\s+pr\s+merge\b")

GATE_PATHS = (
    ".github/",
    ".claude/",
    "docs/adr/",
    "scripts/agent_hooks/",
)
GATE_FILES = frozenset(
    {
        "AGENTS.md",
        "CLAUDE.md",
        "justfile",
        "lefthook.yml",
        "pyproject.toml",
        "uv.lock",
        ".jscpd.json",
        "game/package.json",
        "game/pnpm-lock.yaml",
        "game/eslint.config.js",
        "game/tsconfig.json",
        "game/vitest.config.ts",
        "game/knip.json",
    }
)


def bash_denial(command: str, branch: str, ci_agent: bool) -> str | None:
    """Return why a shell command is denied, or None when it may run."""
    if FORCE_PUSH.search(command):
        return "Force-pushing is not allowed."
    if PUSH_TO_MAIN.search(command) or (BARE_PUSH.search(command) and branch == "main"):
        return "Pushing to main is not allowed; open a PR from a branch."
    if NO_VERIFY.search(command):
        return "Skipping git hooks with --no-verify is not allowed."
    if ci_agent and PR_MERGE.search(command):
        return "Agents never merge PRs; the risk gate and the owner do."
    return None


def edit_denial(file_path: str, project_dir: str, ci_agent: bool) -> str | None:
    """Return why an edit is denied, or None. Only CI agents are fenced off gate files."""
    if not ci_agent:
        return None
    path = PurePosixPath(file_path)
    if path.is_absolute():
        path = path.relative_to(project_dir) if path.is_relative_to(project_dir) else path
    rel = path.as_posix()
    if rel in GATE_FILES or rel.startswith(GATE_PATHS):
        return f"{rel} is a gate file. Stop and label the issue needs-human instead."
    return None


def current_branch() -> str:
    result = subprocess.run(
        ["git", "branch", "--show-current"], capture_output=True, text=True, check=False
    )
    return result.stdout.strip()


def denial_for(event: dict[str, Any], ci_agent: bool) -> str | None:
    tool_input: dict[str, Any] = event.get("tool_input", {})
    if event.get("tool_name") == "Bash":
        return bash_denial(str(tool_input.get("command", "")), current_branch(), ci_agent)
    file_path = tool_input.get("file_path") or tool_input.get("notebook_path")
    if file_path:
        return edit_denial(str(file_path), str(event.get("cwd", "")), ci_agent)
    return None


def main() -> int:
    reason = denial_for(read_event(), is_ci_agent())
    if reason:
        decision = {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
        print(json.dumps({"hookSpecificOutput": decision}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
