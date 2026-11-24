"""Split shell commands into simple commands, the way the guard needs to see them."""

import re
import shlex

# Any token made only of these is a control operator (`&&`, `|&`, `);`), never a word.
SEPARATOR_CHARS = frozenset(";&|()")
# Reserved words that can start a command line without being the command itself.
KEYWORDS = frozenset({"!", "{", "}", "if", "then", "else", "elif", "do", "while", "until", "time"})
ASSIGNMENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
# A here-document (not a `<<<` here-string): its marker line, then the body up to the delimiter.
HEREDOC = re.compile(
    r"(?<!<)(<<-?\s*(['\"]?)([\w.-]+)\2[^\n]*\n).*?^\s*\3[ \t]*$", re.DOTALL | re.MULTILINE
)
# Commands that run the rest of the line as a command, with their options that take a value.
WRAPPERS: dict[str, frozenset[str]] = {
    "env": frozenset({"-u", "--unset", "-C", "--chdir"}),
    "timeout": frozenset({"-s", "--signal", "-k", "--kill-after"}),
    "nohup": frozenset(),
    "exec": frozenset({"-a"}),
    "command": frozenset(),
    "sudo": frozenset({"-u", "--user", "-g", "--group", "-C", "-D", "-h", "-p", "-r", "-t", "-U"}),
    "nice": frozenset({"-n", "--adjustment"}),
    "xargs": frozenset(
        {"-a", "-d", "-E", "-I", "-L", "-n", "-P", "-s", "--arg-file", "--delimiter"}
    ),
}
# `env -S '<command>'` splits the string into words and runs them.
ENV_SPLIT_STRING = ("--split-string=", "--split-string", "-S")
SHELLS = frozenset({"bash", "sh", "zsh", "dash"})


def next_quote(quote: str, ch: str) -> str:
    """The open quote character after reading `ch` (empty outside quotes)."""
    if quote:
        return "" if ch == quote else quote
    return ch if ch in "'\"" else ""


def unquoted_newlines_to_semicolons(command: str) -> str:
    """Treat line breaks outside quotes as command separators, like the shell does.

    Outside single quotes a backslash escapes the next character, and a backslash-newline is a
    line continuation that joins the lines, as in POSIX shells.
    """
    out: list[str] = []
    quote, escaped = "", False
    for ch in command:
        if escaped:
            escaped = False
            out[-1:] = [] if ch == "\n" else [out[-1], ch]
        elif ch == "\\" and quote != "'":
            escaped = True
            out.append(ch)
        else:
            quote = next_quote(quote, ch)
            out.append(" ; " if ch == "\n" and not quote else ch)
    return "".join(out)


def segments(command: str) -> list[list[str]]:
    """Split a shell command into simple commands, without env prefixes or leading keywords."""
    lexer = shlex.shlex(
        unquoted_newlines_to_semicolons(command), posix=True, punctuation_chars=True
    )
    lexer.whitespace_split = True
    # No comment handling: a `#` would otherwise hide the rest of the command (safe side).
    lexer.commenters = ""
    result: list[list[str]] = [[]]
    for token in lexer:
        if set(token) <= SEPARATOR_CHARS:
            result.append([])
        elif result[-1] or not (ASSIGNMENT.match(token) or token in KEYWORDS):
            result[-1].append(token)
    return [words for words in result if words]


def skip_options(args: list[str], with_value: frozenset[str]) -> list[str]:
    """Drop leading options, and the value after each option in `with_value`."""
    i = 0
    while i < len(args) and args[i].startswith("-"):
        i += 2 if args[i] in with_value else 1
    return args[i:]


def command_name(word: str) -> str:
    """`git` for `/usr/bin/git`."""
    return word.rsplit("/", 1)[-1]


def split_words(text: str) -> list[str]:
    try:
        return shlex.split(text)
    except ValueError:
        return text.split()


def expand_env_split_string(words: list[str]) -> list[str]:
    """Replace a leading `env -S '<command>'` option with the words of its string."""
    i = 0
    while i < len(words) and words[i].startswith("-"):
        word = words[i]
        prefix = next((p for p in ENV_SPLIT_STRING if word.startswith(p)), None)
        if prefix and word != prefix:
            return [*words[:i], *split_words(word[len(prefix) :]), *words[i + 1 :]]
        if prefix:
            return [*words[:i], *split_words(" ".join(words[i + 1 : i + 2])), *words[i + 2 :]]
        i += 2 if word in WRAPPERS["env"] else 1
    return words


def strip_wrappers(words: list[str]) -> list[str]:
    """Drop wrapper prefixes and the assignments after them; name commands without their path."""
    while words and (command_name(words[0]) in WRAPPERS or ASSIGNMENT.match(words[0])):
        head, words = command_name(words[0]), words[1:]
        if head == "env":
            words = expand_env_split_string(words)
        if head in WRAPPERS:
            words = skip_options(words, WRAPPERS[head])
        if head == "timeout":
            words = words[1:]
    return [command_name(words[0]), *words[1:]] if words else words


def nested_commands(words: list[str]) -> list[str]:
    """Command strings run by `eval` or by a shell's `-c` option."""
    if words[0] == "eval":
        return [" ".join(words[1:])]
    if words[0] not in SHELLS:
        return []
    for i, word in enumerate(words[1:-1], start=1):
        if word.startswith("-") and not word.startswith("--") and "c" in word:
            return [words[i + 1]]
    return []


def closing_paren(command: str, start: int) -> int:
    """Index of the `)` that closes the `(` just before `start`, or the end of the command."""
    depth = 1
    for i in range(start, len(command)):
        depth += {"(": 1, ")": -1}.get(command[i], 0)
        if depth == 0:
            return i
    return len(command)


def substitution_at(command: str, i: int) -> tuple[str, int] | None:
    """The body of a backtick or `$(…)` substitution starting at `i`, and the index after it."""
    if command[i] == "`":
        end = command.find("`", i + 1)
        end = len(command) if end < 0 else end
        return command[i + 1 : end], end + 1
    if command.startswith("$(", i):
        end = closing_paren(command, i + 2)
        return command[i + 2 : end], end + 1
    return None


def substitutions(command: str, quotes: bool = True) -> list[str]:
    """Bodies of command substitutions outside single quotes; the shell runs these too.

    Without `quotes`, quote characters are plain text, as in an unquoted here-document body.
    """
    bodies: list[str] = []
    quote, i = "", 0
    while i < len(command):
        found = None if quote == "'" else substitution_at(command, i)
        if found:
            bodies.append(found[0])
            i = found[1]
            continue
        if command[i] == "\\" and quote != "'":
            i += 1
        elif quotes and command[i] in "'\"" and quote in ("", command[i]):
            quote = "" if quote else command[i]
        i += 1
    return bodies


def strip_heredocs(command: str) -> str:
    """Drop here-document bodies, which are text rather than commands.

    A body is kept when a shell appears on its marker line (`bash <<EOF`, `cat <<EOF | sh`),
    since the shell runs it.
    """

    def replace(match: re.Match[str]) -> str:
        line = command[command.rfind("\n", 0, match.start()) + 1 : match.end(1)]
        read_by_shell = any(command_name(word) in SHELLS for word in line.split())
        return match[0] if read_by_shell else match[1]

    return HEREDOC.sub(replace, command)


def heredoc_substitutions(command: str) -> list[str]:
    """Command substitutions in bodies under an unquoted delimiter, which the shell runs.

    Quotes inside such a body are plain text, so an apostrophe doesn't hide what follows.
    """
    return [
        body
        for match in HEREDOC.finditer(command)
        if not match[2]
        for body in substitutions(match[0][len(match[1]) :], quotes=False)
    ]
