"""PreToolUse hook: deny commands and edits that would bypass the workflow's gates."""

import json
import re
import shlex
import subprocess
from pathlib import PurePosixPath
from typing import Any

from scripts.agent_hooks.hook_io import is_ci_agent, read_event

# Fallback patterns, used only when a command can't be tokenized (unbalanced quotes).
FORCE_PUSH = re.compile(r"\bgit\s+push\b.*\s(--force(-with-lease)?|-f)\b")
PUSH_TO_MAIN = re.compile(r"\bgit\s+push\b.*(\smain\b|:main\b)")
NO_VERIFY = re.compile(r"\bgit\s+(commit|push)\b.*\s(--no-verify|-n)\b")

SEPARATORS = frozenset({"&&", "||", ";", "|", "&", "(", ")"})
ASSIGNMENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
MAIN_REFS = frozenset({"main", "refs/heads/main"})

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


def unquoted_newlines_to_semicolons(command: str) -> str:
    """Treat line breaks outside quotes as command separators, like the shell does."""
    out, quote = [], ""
    for ch in command:
        if quote:
            quote = "" if ch == quote else quote
        elif ch in "'\"":
            quote = ch
        out.append(";" if ch == "\n" and not quote else ch)
    return "".join(out)


def segments(command: str) -> list[list[str]]:
    """Split a shell command into simple commands, each a list of words without env prefixes."""
    lexer = shlex.shlex(
        unquoted_newlines_to_semicolons(command), posix=True, punctuation_chars=True
    )
    lexer.whitespace_split = True
    result: list[list[str]] = [[]]
    for token in lexer:
        if token in SEPARATORS:
            result.append([])
        elif result[-1] or not ASSIGNMENT.match(token):
            result[-1].append(token)
    return [words for words in result if words]


def is_force_flag(word: str) -> bool:
    if word.startswith("--"):
        return word in ("--force", "--force-with-lease") or word.startswith("--force-with-lease=")
    return word.startswith("-") and "f" in word[1:]


def targets_main(word: str, branch: str) -> bool:
    ref = word.lstrip("+").split(":")[-1]
    return ref in MAIN_REFS or (ref == "HEAD" and branch == "main")


def push_denial(args: list[str], branch: str) -> str | None:
    if any(is_force_flag(a) or a.startswith("+") for a in args):
        return "Force-pushing is not allowed."
    if "--no-verify" in args:
        return "Skipping git hooks with --no-verify is not allowed."
    refs = [a for a in args if not a.startswith("-")]
    if any(targets_main(r, branch) for r in refs[1:]) or (len(refs) <= 1 and branch == "main"):
        return "Pushing to main is not allowed; open a PR from a branch."
    return None


def segment_denial(words: list[str], branch: str, ci_agent: bool) -> str | None:
    if words[0] == "git" and len(words) > 1:
        if words[1] == "push":
            return push_denial(words[2:], branch)
        if words[1] == "commit" and ("--no-verify" in words or "-n" in words):
            return "Skipping git hooks with --no-verify is not allowed."
    if ci_agent and words[:3] == ["gh", "pr", "merge"]:
        return "Agents never merge PRs; the risk gate and the owner do."
    return None


def regex_denial(command: str) -> str | None:
    """Conservative fallback when the command can't be split into words."""
    if FORCE_PUSH.search(command):
        return "Force-pushing is not allowed."
    if PUSH_TO_MAIN.search(command):
        return "Pushing to main is not allowed; open a PR from a branch."
    if NO_VERIFY.search(command):
        return "Skipping git hooks with --no-verify is not allowed."
    return None


def bash_denial(command: str, branch: str, ci_agent: bool) -> str | None:
    """Return why a shell command is denied, or None when it may run.

    Only simple commands that start with `git push`, `git commit` or `gh pr merge` are checked,
    so text that merely mentions them (an issue body, a commit message) is allowed.
    """
    try:
        parts = segments(command)
    except ValueError:
        return regex_denial(command)
    for words in parts:
        reason = segment_denial(words, branch, ci_agent)
        if reason:
            return reason
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
