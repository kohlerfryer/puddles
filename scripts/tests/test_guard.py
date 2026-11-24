import io
import json

import pytest

from scripts.agent_hooks import guard
from scripts.agent_hooks.guard import bash_denial, denial_for, edit_denial

PROJECT = "/repo"


@pytest.mark.parametrize(
    "command",
    [
        "git push --force origin agent/3-x",
        "git push -f",
        "git push --force-with-lease origin agent/3-x",
        "git push origin main",
        "git push origin HEAD:main",
        "git commit --no-verify -m 'skip hooks'",
    ],
)
def test_denies_commands_that_bypass_gates(command: str) -> None:
    assert bash_denial(command, branch="agent/3-x", ci_agent=False)


@pytest.mark.parametrize(
    "command",
    [
        "git push -u origin agent/3-claude-hooks",
        "git push origin agent/3-fix-main-bug",
        "git switch main && git pull --rebase",
        "gh pr merge 8 --rebase",
        "just check",
    ],
)
def test_allows_normal_commands_for_the_owner(command: str) -> None:
    assert bash_denial(command, branch="agent/3-x", ci_agent=False) is None


def test_denies_bare_push_while_on_main() -> None:
    assert bash_denial("git push", branch="main", ci_agent=False)
    assert bash_denial("git push", branch="agent/3-x", ci_agent=False) is None


def test_ci_agents_cannot_merge() -> None:
    assert bash_denial("gh pr merge 8 --rebase", branch="agent/3-x", ci_agent=True)


@pytest.mark.parametrize(
    "path",
    [
        "/repo/.github/workflows/ci.yml",
        "/repo/pyproject.toml",
        "game/eslint.config.js",
        "/repo/docs/adr/2026-11-22-x.md",
        "/repo/scripts/agent_hooks/guard.py",
    ],
)
def test_ci_agents_cannot_edit_gate_files(path: str) -> None:
    assert edit_denial(path, PROJECT, ci_agent=True)


def test_ci_agents_can_edit_source() -> None:
    assert edit_denial("/repo/game/src/title.ts", PROJECT, ci_agent=True) is None


def test_owner_sessions_can_edit_gate_files() -> None:
    assert edit_denial("/repo/pyproject.toml", PROJECT, ci_agent=False) is None


def test_routes_events_by_tool(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(guard, "current_branch", lambda: "agent/3-x")
    bash = {"tool_name": "Bash", "tool_input": {"command": "git push -f"}}
    edit = {"tool_name": "Edit", "cwd": PROJECT, "tool_input": {"file_path": "/repo/justfile"}}
    other = {"tool_name": "Read", "tool_input": {}}

    assert denial_for(bash, ci_agent=False)
    assert denial_for(edit, ci_agent=True)
    assert denial_for(other, ci_agent=True) is None


def test_main_prints_a_deny_decision(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    event = {"tool_name": "Bash", "tool_input": {"command": "git push --force"}}
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(event)))
    monkeypatch.setattr(guard, "current_branch", lambda: "agent/3-x")

    assert guard.main() == 0
    reply = json.loads(capsys.readouterr().out)
    assert reply["hookSpecificOutput"]["permissionDecision"] == "deny"


def test_main_stays_silent_when_allowed(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr("sys.stdin", io.StringIO(""))

    assert guard.main() == 0
    assert capsys.readouterr().out == ""


@pytest.mark.parametrize(
    "command",
    [
        "git push -u origin agent/59-x && gh pr create --base main --title t",
        'gh issue create --title "Guard" --body "never run git push origin main"',
        "git commit -m 'Explain why git push --force is banned'",
        "git push origin agent/59-x; gh api -X PATCH repos/o/r -f state=closed",
        "cat <<'EOF'\nnotes\nEOF",
        "git push origin agent/x &&\ngh pr create --base main",
        'gh issue create --body "never use git commit --no-verify"',
    ],
)
def test_allows_commands_that_only_mention_dangerous_ones(command: str) -> None:
    assert bash_denial(command, branch="agent/59-x", ci_agent=False) is None


@pytest.mark.parametrize(
    "command",
    [
        "cd game && git push origin main",
        "git status\ngit push origin HEAD:main",
        "FOO=1 git push -fu origin agent/59-x",
        "git push origin +agent/59-x",
        "git add . && git commit -n -m wip",
        "git push origin refs/heads/main",
        "# push the branch\ngit push --force origin agent/x",
        "git push origin feat#1; git push origin main",
        "git add . &&\ngit push --force origin agent/x",
        "(cd game && pnpm build)\ngit push origin main",
        "git status ||\ngit push origin main",
        "ls |\ngit push --force origin x",
        "git status |& git push --force origin x",
        "if true; then git push origin main; fi",
        "for b in a c; do git push --force origin $b; done",
        "{ git push --force origin x; }",
        "! git push origin main",
        "while true; do git push origin main; done",
        "until false; do git push origin main; done",
        "if false; then :; elif true; then git push origin main; fi",
        "if false; then :; else git push origin main; fi",
        "time git push --force origin x",
        "git commit -m 'it'\\''s'\ngit push --force origin y",
        'git commit -m "fix \\"x"\ngit push --force origin y',
        'echo \\"\ngit push origin main',
        "git add . && \\\n  git push --force origin x",
        "git status && \\\ngit push --force origin x",
        "git push origin \\\nmain",
        "git push \\\n--force origin x",
        "git commit -m x \\\n--no-verify",
    ],
)
def test_denies_dangerous_commands_inside_compound_ones(command: str) -> None:
    assert bash_denial(command, branch="agent/59-x", ci_agent=False)


def test_denies_pushing_head_while_on_main() -> None:
    assert bash_denial("git push -u origin HEAD", branch="main", ci_agent=False)
    assert bash_denial("git push -u origin HEAD", branch="agent/59-x", ci_agent=False) is None


def test_falls_back_to_patterns_for_unbalanced_quotes() -> None:
    assert bash_denial("git push --force 'oops", branch="agent/59-x", ci_agent=False)
    assert bash_denial("echo 'oops", branch="agent/59-x", ci_agent=False) is None


@pytest.mark.parametrize(
    "command",
    [
        "env X=1 git push -f",
        "env -i PATH=/bin git push origin main",
        "timeout 60 git push --force",
        "timeout -s KILL 60 git push -f",
        "nohup git push -f",
        "command git push -f",
    ],
)
def test_wrapper_prefixes_do_not_hide_a_push(command: str) -> None:
    assert bash_denial(command, branch="agent/3-x", ci_agent=False)


@pytest.mark.parametrize(
    "command",
    [
        "bash -c 'git push -f'",
        'sh -c "git commit --no-verify -m x"',
        "bash -lc 'git push origin main'",
        "eval git push -f",
        "eval 'git push -f'",
        "echo `git push -f`",
        'echo "$(git push -f)"',
        "x=$(echo $(git push -f))",
        'echo "`git commit -n -m x`"',
    ],
)
def test_nested_command_strings_are_checked(command: str) -> None:
    assert bash_denial(command, branch="agent/3-x", ci_agent=False)


@pytest.mark.parametrize(
    "command",
    [
        "git -C /repo push -f",
        "git -c core.hooksPath=/dev/null push origin main",
        "git --git-dir=.git --no-pager push -f",
        "git -C /repo commit --no-verify -m x",
    ],
)
def test_global_git_options_are_skipped(command: str) -> None:
    assert bash_denial(command, branch="agent/3-x", ci_agent=False)


@pytest.mark.parametrize(
    "command",
    ["git commit -anm 'msg'", "git commit -nm x", "git commit -a -n", "git commit -v -m x -n"],
)
def test_n_inside_combined_commit_flags_counts_as_no_verify(command: str) -> None:
    assert bash_denial(command, branch="agent/3-x", ci_agent=False)


@pytest.mark.parametrize(
    "command",
    [
        "env X=1 echo git push -f",
        "timeout 60 just check",
        "nohup just test",
        "bash -c 'echo git push -f'",
        "eval echo git push -f",
        "echo '`git push -f`'",
        "echo '$(git push -f)'",
        "echo $(git status)",
        "git -C /repo push -u origin agent/3-x",
        "git commit -am 'fix and note'",
        "git commit -mnote",
        "git commit -m x -- -n.txt",
        'git commit -m "- Add new test"',
        'git commit -m x -m "- Rename y"',
        'git commit -am "- note"',
        'git commit --message "- Add new test"',
        "env X=1",
        "bash script.sh",
        "echo $(git status",
    ],
)
def test_allows_wrapped_and_nested_commands_that_only_mention_a_push(command: str) -> None:
    assert bash_denial(command, branch="agent/3-x", ci_agent=False) is None


def test_heredoc_bodies_are_text_not_commands() -> None:
    message = "git commit -F- <<'EOF'\nFix docs\n\ngit push -f is denied now\nEOF\n"
    substituted = "git commit -m \"$(cat <<'EOF'\nFix docs\ngit push -f is denied\nEOF\n)\""

    assert bash_denial(message, branch="agent/3-x", ci_agent=False) is None
    assert bash_denial(substituted, branch="agent/3-x", ci_agent=False) is None
    assert bash_denial("cat <<EOF\nx\nEOF\ngit push -f", branch="agent/3-x", ci_agent=False)


@pytest.mark.parametrize(
    "command",
    [
        "cat <<EOF\n$(git push -f)\nEOF",
        "cat <<EOF\n`git push -f`\nEOF",
        "/usr/bin/git push -f",
        "/bin/bash -c 'git push -f'",
        "exec git push -f",
    ],
)
def test_unquoted_heredoc_substitutions_paths_and_exec_are_checked(command: str) -> None:
    assert bash_denial(command, branch="agent/3-x", ci_agent=False)


def test_heredoc_delimiters_may_contain_dashes() -> None:
    message = "git commit -F- <<'END-MSG'\nit's about git push -f\nEND-MSG\n"

    assert bash_denial(message, branch="agent/3-x", ci_agent=False) is None
    assert bash_denial("cat <<'EOF'\n$(git push -f)\nEOF", branch="x", ci_agent=False) is None


@pytest.mark.parametrize(
    "command",
    [
        "bash <<'EOF'\ngit push -f\nEOF",
        "sh <<EOF\ngit push origin main\nEOF",
        "cat <<'EOF' | bash -s\ngit push -f\nEOF",
    ],
)
def test_heredocs_read_by_a_shell_are_commands(command: str) -> None:
    assert bash_denial(command, branch="agent/3-x", ci_agent=False)


def test_here_strings_are_not_heredocs() -> None:
    command = "grep x <<< EOF\ngit push -f\nEOF"

    assert bash_denial(command, branch="agent/3-x", ci_agent=False)
