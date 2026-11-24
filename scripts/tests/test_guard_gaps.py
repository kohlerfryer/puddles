import pytest

from scripts.agent_hooks.guard import bash_denial


@pytest.mark.parametrize(
    "command",
    [
        "sudo git push -f",
        "sudo -u root git push origin main",
        "nice git push -f",
        "nice -n 5 git push -f",
        "xargs git push -f",
        "xargs -I {} git push --force origin {}",
        "env -S 'git push -f'",
        "env -S'git push origin main'",
        "env --split-string='X=1 git push -f'",
        "env -u HOME -S 'git push -f'",
        "env -iS 'git push -f'",
        "env --split-str='git push -f'",
        "sudo -T 10 git push -f",
        "sudo -R / git push origin main",
        "sudo --chdir /repo git push -f",
        "xargs --max-args 1 git push -f",
    ],
)
def test_sudo_nice_xargs_and_env_split_strings_do_not_hide_a_push(command: str) -> None:
    assert bash_denial(command, branch="agent/3-x", ci_agent=False)


@pytest.mark.parametrize(
    "command",
    [
        "sudo apt-get install shellcheck",
        "nice -n 5 just check",
        "xargs echo git push -f",
        "env -S 'echo git push -f'",
    ],
)
def test_sudo_nice_xargs_and_env_split_strings_that_only_mention_a_push(command: str) -> None:
    assert bash_denial(command, branch="agent/3-x", ci_agent=False) is None


@pytest.mark.parametrize(
    "command",
    ["gh -R owner/repo pr merge 1", "gh --repo owner/repo pr merge 1", "gh pr -R o/r merge 1"],
)
def test_gh_options_before_the_subcommand_do_not_hide_a_merge(command: str) -> None:
    assert bash_denial(command, branch="agent/3-x", ci_agent=True)


@pytest.mark.parametrize(
    "command",
    ["gh -R owner/repo pr view 1", "gh -R owner/repo issue create --title 'gh pr merge'"],
)
def test_gh_options_with_other_subcommands_are_allowed(command: str) -> None:
    assert bash_denial(command, branch="agent/3-x", ci_agent=True) is None


def test_apostrophes_in_unquoted_heredocs_do_not_hide_substitutions() -> None:
    message = "git commit -F- <<EOF\nDon't $(git push -f)\nEOF"
    after = 'cat <<EOF\nit\'s\nEOF\necho "$(git push -f)"'

    assert bash_denial(message, branch="agent/3-x", ci_agent=False)
    assert bash_denial(after, branch="agent/3-x", ci_agent=False)


def test_apostrophes_in_heredocs_without_substitutions_are_text() -> None:
    plain = "git commit -F- <<EOF\nDon't run git push -f\nEOF"
    quoted = "git commit -F- <<'EOF'\nDon't $(git push -f)\nEOF"

    assert bash_denial(plain, branch="agent/3-x", ci_agent=False) is None
    assert bash_denial(quoted, branch="agent/3-x", ci_agent=False) is None


@pytest.mark.parametrize(
    "command",
    [
        "git commit --no-verif -m x",
        "git push --forc origin agent/3-x",
        "git push --force-with origin agent/3-x",
        "git push --no-verif origin agent/3-x",
    ],
)
def test_long_option_prefixes_count_like_the_full_option(command: str) -> None:
    assert bash_denial(command, branch="agent/3-x", ci_agent=False)


@pytest.mark.parametrize(
    "command",
    [
        "git push --follow-tags origin agent/3-x",
        "git commit --no-edit",
        "git push --tags origin",
        "git push origin =x",
        "git commit -m x -- =notes",
    ],
)
def test_other_long_options_are_allowed(command: str) -> None:
    assert bash_denial(command, branch="agent/3-x", ci_agent=False) is None


@pytest.mark.parametrize(
    "command",
    [
        "git push --mirror origin",
        "git push --mirr origin",
        "git push --all origin",
        "git push --branches origin",
    ],
)
def test_pushing_every_ref_is_denied(command: str) -> None:
    assert bash_denial(command, branch="agent/3-x", ci_agent=False)


def test_mentioning_a_mirror_push_is_allowed() -> None:
    command = 'gh issue create --body "git push --mirror pushes main"'

    assert bash_denial(command, branch="agent/3-x", ci_agent=False) is None


@pytest.mark.parametrize(
    "command",
    [
        'bash <<EOF\nit\'s\nEOF\necho "$(gh pr merge 1)"',
        "echo 'unbalanced; gh pr merge 1",
        "echo 'unbalanced; gh -R o/r pr merge 1",
    ],
)
def test_a_merge_is_denied_when_the_command_cannot_be_split(command: str) -> None:
    assert bash_denial(command, branch="agent/3-x", ci_agent=True)


def test_quotes_in_a_shell_read_heredoc_do_not_stop_the_split_after_it() -> None:
    mentioned = "bash <<EOF\nit's\nEOF\necho 'git push -f'"
    pushed = "bash <<EOF\nit's\nEOF\ngit -C . push --force"

    assert bash_denial(mentioned, branch="agent/3-x", ci_agent=False) is None
    assert bash_denial(pushed, branch="agent/3-x", ci_agent=False)


@pytest.mark.parametrize(
    "command",
    [
        "env -CSdir git push -f",
        "env -iC dir git push -f",
        "env -a x git push -f",
        "env --argv0 x git push -f",
        "env -a x -S 'git push -f'",
    ],
)
def test_env_chdir_clusters_and_argv0_do_not_hide_a_push(command: str) -> None:
    assert bash_denial(command, branch="agent/3-x", ci_agent=False)
