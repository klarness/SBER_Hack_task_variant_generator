import re


SUPERSCRIPT_DIGITS = {
    "⁰": "0",
    "¹": "1",
    "²": "2",
    "³": "3",
    "⁴": "4",
    "⁵": "5",
    "⁶": "6",
    "⁷": "7",
    "⁸": "8",
    "⁹": "9",
}
SUPERSCRIPT_MAP = str.maketrans(SUPERSCRIPT_DIGITS)

MATH_HINT_RE = re.compile(r"[A-Za-z][0-9²³¹^]|[0-9][A-Za-z]|[=+\-*/·×^]|[()]{1}")
TEXT_WORD_RE = re.compile(r"[А-Яа-яЁёA-Za-z]{3,}")
DIAGNOSTIC_TEXT_RE = re.compile(
    r"(ai worker failed|gigachat|generated item did not pass validation|all attempts fail|status \d{3}|detail)",
    re.IGNORECASE,
)
CHOICE_MARKER_RE = re.compile(r"(?:(?<=^)|(?<=[;\s]))([а-гА-Гa-dA-D]\)\s*)")


def normalize_math_markup(text: str) -> str:
    text = _remove_dangling_dollars(text)
    text = _normalize_existing_math(text)
    text = _close_unbalanced_dollars(text)
    text = _wrap_choice_math(text)
    text = _remove_dangling_dollars(text)
    return text


def _normalize_existing_math(text: str) -> str:
    def replace(match: re.Match[str]) -> str:
        return f"${_normalize_formula(match.group(1))}$"

    return re.sub(r"\$([^$\n]+)\$", replace, text)


def _remove_dangling_dollars(text: str) -> str:
    lines = []
    for line in text.splitlines():
        line = re.sub(r"\$\.\$\.+\s*$", "$.", line).rstrip()
        line = re.sub(r"\$\$\.+\s*$", "$.", line).rstrip()
        line = re.sub(r"\${2,}\s*$", "", line).rstrip()
        if line.count("$") % 2 == 1 and re.search(r"\$[\s.,;:!?]*$", line):
            line = re.sub(r"\$([\s.,;:!?]*)$", r"\1", line).rstrip()
        lines.append(line)
    return "\n".join(lines)


def _close_unbalanced_dollars(text: str) -> str:
    lines = []
    for line in text.splitlines():
        if line.count("$") % 2 == 1:
            line = line.rstrip()
            trailing = ""
            while line and line[-1] in ".;,":
                trailing = line[-1] + trailing
                line = line[:-1].rstrip()
            line = f"{line}${trailing}"
        lines.append(line)
    return "\n".join(lines)


def _wrap_choice_math(text: str) -> str:
    lines = []
    for line in text.splitlines():
        lines.append(_wrap_outside_existing_math(line))
    return "\n".join(lines)


def _wrap_outside_existing_math(line: str) -> str:
    result = []
    last_index = 0

    for match in re.finditer(r"\$[^$\n]+\$", line):
        if match.start() > last_index:
            result.append(_wrap_math_segments_in_line(line[last_index:match.start()]))
        result.append(match.group(0))
        last_index = match.end()

    if last_index < len(line):
        result.append(_wrap_math_segments_in_line(line[last_index:]))

    return "".join(result)


def _wrap_math_segments_in_line(line: str) -> str:
    matches = list(CHOICE_MARKER_RE.finditer(line))
    if not matches:
        return _wrap_after_colon(line)

    result = [line[: matches[0].start(1)]]
    for index, match in enumerate(matches):
        content_start = match.end(1)
        content_end = matches[index + 1].start(1) if index + 1 < len(matches) else len(line)
        content = line[content_start:content_end]
        result.append(match.group(1))
        result.append(_wrap_leading_formula(content))
    return "".join(result)


def _wrap_after_colon(line: str) -> str:
    prefix, separator, suffix = line.partition(":")
    if not separator:
        return line
    if not _looks_like_formula(suffix):
        return line
    return f"{prefix}{separator} {_wrap_formula_text(suffix.strip())}"


def _wrap_leading_formula(text: str) -> str:
    match = re.match(r"([^;,.]+)([;,.]?)(.*)$", text.strip())
    if not match:
        return text

    candidate, punctuation, rest = match.groups()
    if not _looks_like_formula(candidate):
        return text

    wrapped = _wrap_formula_text(candidate.strip())
    separator = " " if punctuation and not rest.startswith(" ") else ""
    return f"{wrapped}{punctuation}{separator}{rest}"


def _wrap_formula_text(value: str) -> str:
    return f"${_normalize_formula(value)}$"


def _normalize_formula(value: str) -> str:
    value = value.strip()
    value = _unicode_superscripts_to_latex(value)
    value = value.translate(SUPERSCRIPT_MAP)
    value = re.sub(r"([A-Za-zА-Яа-яЁё)])\^([0-9]+)", r"\1^{\2}", value)
    value = value.replace("·", r"\cdot")
    value = value.replace("×", r"\cdot")
    value = re.sub(r"\s*\\cdot\s*", r" \\cdot ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def _unicode_superscripts_to_latex(value: str) -> str:
    superscript_chars = "".join(SUPERSCRIPT_DIGITS.keys())
    return re.sub(
        rf"([A-Za-zА-Яа-яЁё0-9)])([{superscript_chars}]+)",
        lambda match: f"{match.group(1)}^{{{match.group(2).translate(SUPERSCRIPT_MAP)}}}",
        value,
    )


def _looks_like_formula(value: str) -> bool:
    value = value.strip()
    if not value:
        return False
    if DIAGNOSTIC_TEXT_RE.search(value):
        return False
    if TEXT_WORD_RE.search(value):
        return False
    return bool(MATH_HINT_RE.search(value))
