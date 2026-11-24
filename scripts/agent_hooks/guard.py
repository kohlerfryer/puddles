"""PreToolUse hook: deny commands and edits that would bypass the workflow's gates."""

import json
import re
import subprocess
from pathlib import PurePosixPath
from typing import Any

from scripts.agent_hooks.hook_io import is_ci_agent, read_event
from scripts.agent_hooks.shell_words import (
    abbreviates,
    heredoc_substitutions,
    nested_commands,
    segments,
    skip_options,
    strip_heredocs,
    strip_wrappers,
    substitutions,
)

# Fallback patterns, used only when a command can't be tokenized (unbalanced quotes).
FORCE_PUSH = re.compile(r"\bgit\s+push\b.*\s(--force(-with-lease)?|-f)\b")
PUSH_TO_MAIN = re.compile(r"\bgit\s+push\b.*(\smain\b|:main\b)")
NO_VERIFY = re.compile(r"\bgit\s+(commit|push)\b.*\s(--no-verify|-n)\b")

MAIN_REFS = frozenset({"main", "refs/heads/main"})
GIT_OPTIONS_WITH_VALUE = frozenset({"-C", "-c", "--git-dir", "--work-tree", "--namespace"})
# A cluster of short `git commit` flags: plain flags, then maybe one that takes a value
# (`-mmsg`, or `-m msg` with the value in the next word; `-S` and `-u` only take it inline).
COMMIT_FLAGS = re.compile(r"-([^mFCctSu]*)([mFCctSu]?)(.*)")
COMMIT_SHORT_WITH_VALUE = frozenset("mFCct")
COMMIT_LONG_WITH_VALUE = frozenset({"--message", "--file", "--template", "--author", "--trailer"})
GH_OPTIONS_WITH_VALUE = frozenset({"-R", "--repo"})

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


def commit_skips_hooks(args: list[str]) -> bool:
    """True for `--no-verify` or an `n` among combined short flags (`-anm`)."""
    words = iter(args)
    for arg in words:
        if arg == "--":
            return False
        if abbreviates(arg, "--no-verify"):
            return True
        cluster = COMMIT_FLAGS.fullmatch(arg) if not arg.startswith("--") else None
        if cluster and "n" in cluster[1]:
            return True
        if arg in COMMIT_LONG_WITH_VALUE or (
            cluster and cluster[2] in COMMIT_SHORT_WITH_VALUE and not cluster[3]
        ):
            next(words, None)
    return False


def is_force_flag(word: str) -> bool:
    if word.startswith("--"):
        return abbreviates(word, "--force") or abbreviates(word, "--force-with-lease")
    return word.startswith("-") and "f" in word[1:]


def targets_main(word: str, branch: str) -> bool:
    ref = word.lstrip("+").split(":")[-1]
    return ref in MAIN_REFS or (ref == "HEAD" and branch == "main")


def push_denial(args: list[str], branch: str) -> str | None:
    if any(is_force_flag(a) or a.startswith("+") for a in args):
        return "Force-pushing is not allowed."
    if any(abbreviates(a, "--no-verify") for a in args):
        return "Skipping git hooks with --no-verify is not allowed."
    if any(abbreviates(a, o) for a in args for o in ("--mirror", "--all", "--branches")):
        return "Pushing every ref pushes main too; push your branch by name."
    refs = [a for a in args if not a.startswith("-")]
    if any(targets_main(r, branch) for r in refs[1:]) or (len(refs) <= 1 and branch == "main"):
        return "Pushing to main is not allowed; open a PR from a branch."
    return None


def git_denial(args: list[str], branch: str) -> str | None:
    args = skip_options(args, GIT_OPTIONS_WITH_VALUE)
    if args[:1] == ["push"]:
        return push_denial(args[1:], branch)
    if args[:1] == ["commit"] and commit_skips_hooks(args[1:]):
        return "Skipping git hooks with --no-verify is not allowed."
    return None


def segment_denial(words: list[str], branch: str, ci_agent: bool) -> str | None:
    words = strip_wrappers(words)
    if not words:
        return None
    for nested in nested_commands(words):
        reason = bash_denial(nested, branch, ci_agent)
        if reason:
            return reason
    if words[0] == "git":
        return git_denial(words[1:], branch)
    if ci_agent and words[0] == "gh" and gh_merges(words[1:]):
        return "Agents never merge PRs; the risk gate and the owner do."
    return None


def gh_merges(args: list[str]) -> bool:
    """`gh pr merge`, with options like `-R owner/repo` before either subcommand."""
    args = skip_options(args, GH_OPTIONS_WITH_VALUE)
    return args[:1] == ["pr"] and skip_options(args[1:], GH_OPTIONS_WITH_VALUE)[:1] == ["merge"]


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
    so text that merely mentions them (an issue body, a commit message) is allowed. Wrapper
    prefixes are skipped, and strings run by `bash -c`, `eval` or command substitution are
    checked as commands too. Here-document bodies are text, apart from their substitutions.
    """
    stripped = strip_heredocs(command)
    for body in substitutions(stripped) + heredoc_substitutions(command):
        reason = bash_denial(body, branch, ci_agent)
        if reason:
            return reason
    try:
        parts = segments(stripped)
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
