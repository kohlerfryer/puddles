"""Split shell commands into simple commands, the way the guard needs to see them."""

import re
import shlex

# Any token made only of these is a control operator (`&&`, `|&`, `);`), never a word.
SEPARATOR_CHARS = frozenset(";&|()")
# Reserved words that can start a command line without being the command itself.
KEYWORDS = frozenset({"!", "{", "}", "if", "then", "else", "elif", "do", "while", "until", "time"})
ASSIGNMENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
# A here-document: its marker line, then the body up to the delimiter line.
HEREDOC = re.compile(
    r"(<<-?\s*['\"]?(\w+)['\"]?[^\n]*\n).*?^\s*\2[ \t]*$", re.DOTALL | re.MULTILINE
)
# Commands that run the rest of the line as a command, with their options that take a value.
WRAPPERS: dict[str, frozenset[str]] = {
    "env": frozenset({"-u", "--unset", "-C", "--chdir"}),
    "timeout": frozenset({"-s", "--signal", "-k", "--kill-after"}),
    "nohup": frozenset(),
    "command": frozenset(),
}
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


def strip_wrappers(words: list[str]) -> list[str]:
    """Drop `env`, `timeout`, `nohup` and `command` prefixes and the assignments after them."""
    while words and (words[0] in WRAPPERS or ASSIGNMENT.match(words[0])):
        head, words = words[0], words[1:]
        if head in WRAPPERS:
            words = skip_options(words, WRAPPERS[head])
        if head == "timeout":
            words = words[1:]
    return words


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


def substitutions(command: str) -> list[str]:
    """Bodies of command substitutions outside single quotes; the shell runs these too."""
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
        elif command[i] in "'\"" and quote in ("", command[i]):
            quote = "" if quote else command[i]
        i += 1
    return bodies


def strip_heredocs(command: str) -> str:
    """Drop here-document bodies, which are text rather than commands."""
    return HEREDOC.sub(r"\1", command)
