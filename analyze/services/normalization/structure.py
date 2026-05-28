import re
from dataclasses import dataclass


LETTER_MARKER_RE = re.compile(r"(?:(?<=^)|(?<=[\s;:!?]))([A-DVGa-dvgА-Га-г])\s*[\).](?=\s+\S)", re.IGNORECASE)
NUMBER_MARKER_RE = re.compile(r"(?:(?<=^)|(?<=[\s;:!?]))([1-9]\d*)\s*[\).](?=\s+\S)")
CIRCLE_MARKER_RE = re.compile(r"(?:(?<=^)|(?<=[\s;]))[\u25CBОO]\s+(?=\S)")
LINE_LETTER_RE = re.compile(r"^\s*[A-DVGa-dvgА-Га-г]\s*[\).]\s+\S", re.IGNORECASE)
LINE_NUMBER_RE = re.compile(r"^\s*[1-9]\d*\s*[\).]\s+\S")
LINE_CIRCLE_RE = re.compile(r"^\s*[\u25CBОO]\s+\S")
CHOICE_TASK_RE = re.compile(
    r"(выбери|выберите|укажи|укажите|определи|определите|правильн|вариант|ответ)",
    re.IGNORECASE,
)
SHORT_OPTION_LINE_RE = re.compile(r"^[^\n:;!?]{1,80}$")

QUOTE_RE = re.compile(r"[\"«](.+?)[\"»]")
REPLACE_RE = re.compile(r"\b(замени|заменить|поменяй|поменять)\b", re.IGNORECASE)
KEEP_OTHERS_RE = re.compile(r"(остальн\w+.*не\s+меняй|не\s+меняй.*остальн\w+)", re.IGNORECASE)


@dataclass(frozen=True)
class ChoiceStructure:
    count: int = 0
    marker: str = ""
    multiline: bool = False

    @property
    def exists(self) -> bool:
        return self.count >= 2


@dataclass(frozen=True)
class ChoiceOption:
    marker: str
    content: str


@dataclass(frozen=True)
class ParsedInlineChoices:
    prefix: str
    options: list[ChoiceOption]


def detect_choice_structure(text: str) -> ChoiceStructure:
    lines = [line.strip() for line in str(text or "").splitlines() if line.strip()]

    inline_counts = {
        "circle": len(CIRCLE_MARKER_RE.findall(text)),
        "letter": len(LETTER_MARKER_RE.findall(text)),
        "number": len(NUMBER_MARKER_RE.findall(text)),
    }
    line_counts = {
        "circle": sum(1 for line in lines if LINE_CIRCLE_RE.search(line)),
        "letter": sum(1 for line in lines if LINE_LETTER_RE.search(line)),
        "number": sum(1 for line in lines if LINE_NUMBER_RE.search(line)),
        "plain": _plain_option_line_count(lines),
    }
    marker, count = max(
        {**line_counts, **inline_counts}.items(),
        key=lambda item: item[1],
    )
    if count >= 2:
        return ChoiceStructure(
            count=count,
            marker=marker,
            multiline=line_counts.get(marker, 0) == count,
        )

    return ChoiceStructure()


def render_choice_structure_hint(text: str) -> str:
    structure = detect_choice_structure(text)
    if not structure.exists:
        return "Явной структуры вариантов ответа не обнаружено."

    marker_label = {
        "circle": "кружки/варианты без букв",
        "letter": "буквенные варианты",
        "number": "нумерованные варианты",
        "plain": "варианты ответа отдельными строками",
    }.get(structure.marker, "варианты ответа")
    layout = "каждый вариант на отдельной строке" if structure.multiline else "варианты записаны в строку"

    return (
        f"В исходнике обнаружены {marker_label}: ровно {structure.count} варианта ответа; "
        f"формат: {layout}. Новый вариант обязан сохранить ровно {structure.count} варианта ответа "
        "и тот же способ записи."
    )


def choice_structure_matches(original: str, generated: str) -> bool:
    original_structure = detect_choice_structure(original)
    if not original_structure.exists:
        return True

    generated_structure = detect_choice_structure(generated)
    if not generated_structure.exists:
        return False
    if generated_structure.count != original_structure.count:
        return False
    return True


def normalize_generated_choice_layout(original: str, generated: str) -> str:
    original_structure = detect_choice_structure(original)
    if not original_structure.exists:
        return generated

    generated_structure = detect_choice_structure(generated)
    if generated_structure.exists and generated_structure.count > original_structure.count:
        generated = _trim_extra_choices(generated, generated_structure, original_structure.count)
        generated_structure = detect_choice_structure(generated)

    if not original_structure.multiline:
        return generated

    if generated_structure.multiline:
        return generated

    if generated_structure.marker == "circle":
        return _split_inline_markers(generated, CIRCLE_MARKER_RE)
    if generated_structure.marker == "letter":
        return _split_inline_markers(generated, LETTER_MARKER_RE)
    if generated_structure.marker == "number":
        return _split_inline_markers(generated, NUMBER_MARKER_RE)

    return generated


def apply_custom_option_instruction(base_content: str, generated: str, custom_prompt: str) -> str:
    """Preserve untouched answer options for instructions like "replace X, keep others"."""
    prompt = str(custom_prompt or "")
    if not (REPLACE_RE.search(prompt) and KEEP_OTHERS_RE.search(prompt)):
        return generated

    quoted = _first_quoted_text(prompt)
    if not quoted:
        return generated

    base = parse_inline_choices(base_content)
    parsed_generated = parse_inline_choices(generated)
    if not base or not parsed_generated:
        return generated

    target_index = _find_option_index(base.options, quoted)
    if target_index is None:
        return generated

    replacement = _pick_replacement(parsed_generated.options, base.options, target_index, quoted)
    if not replacement:
        return generated

    new_options = list(base.options)
    new_options[target_index] = ChoiceOption(marker=new_options[target_index].marker, content=replacement)
    return _render_inline_choices(base.prefix, new_options)


def parse_inline_choices(text: str) -> ParsedInlineChoices | None:
    text = str(text or "").strip()
    if not text:
        return None

    letter = _parse_inline_choices_with_pattern(text, LETTER_MARKER_RE)
    number = _parse_inline_choices_with_pattern(text, NUMBER_MARKER_RE)
    parsed = max((item for item in (letter, number) if item), key=lambda item: len(item.options), default=None)
    if parsed and len(parsed.options) >= 2:
        return parsed
    return None


def _parse_inline_choices_with_pattern(text: str, pattern: re.Pattern[str]) -> ParsedInlineChoices | None:
    matches = list(pattern.finditer(text))
    if len(matches) < 2:
        return None

    prefix = text[: matches[0].start()].strip()
    options: list[ChoiceOption] = []
    for index, match in enumerate(matches):
        content_start = match.end()
        content_end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        content = text[content_start:content_end].strip(" ;,\n\t")
        if content:
            options.append(ChoiceOption(marker=match.group(1), content=content))

    if len(options) < 2:
        return None
    return ParsedInlineChoices(prefix=prefix, options=options)


def _pick_replacement(
    generated_options: list[ChoiceOption],
    base_options: list[ChoiceOption],
    target_index: int,
    target_text: str,
) -> str:
    if target_index < len(generated_options):
        candidate = generated_options[target_index].content.strip()
        if candidate and not _same_text(candidate, target_text):
            return candidate

    preserved = {
        _normalize_option_text(option.content)
        for index, option in enumerate(base_options)
        if index != target_index
    }
    for option in generated_options:
        candidate = option.content.strip()
        normalized = _normalize_option_text(candidate)
        if candidate and normalized not in preserved and not _same_text(candidate, target_text):
            return candidate
    return ""


def _find_option_index(options: list[ChoiceOption], target: str) -> int | None:
    normalized_target = _normalize_option_text(target)
    for index, option in enumerate(options):
        normalized_option = _normalize_option_text(option.content)
        if normalized_option == normalized_target or normalized_target in normalized_option:
            return index
    return None


def _first_quoted_text(text: str) -> str:
    match = QUOTE_RE.search(text)
    return match.group(1).strip() if match else ""


def _same_text(left: str, right: str) -> bool:
    return _normalize_option_text(left) == _normalize_option_text(right)


def _normalize_option_text(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "").strip()).casefold()


def _render_inline_choices(prefix: str, options: list[ChoiceOption]) -> str:
    rendered_options = " ".join(f"{option.marker}) {option.content.strip()}" for option in options)
    if prefix:
        return f"{prefix.strip()} {rendered_options}".strip()
    return rendered_options.strip()


def _trim_extra_choices(text: str, structure: ChoiceStructure, allowed_count: int) -> str:
    if allowed_count < 2:
        return text

    if structure.multiline:
        return _trim_extra_choice_lines(text, structure, allowed_count)
    if structure.marker == "circle":
        return _trim_inline_markers(text, CIRCLE_MARKER_RE, allowed_count)
    if structure.marker == "letter":
        return _trim_inline_markers(text, LETTER_MARKER_RE, allowed_count)
    if structure.marker == "number":
        return _trim_inline_markers(text, NUMBER_MARKER_RE, allowed_count)
    return text


def _trim_extra_choice_lines(text: str, structure: ChoiceStructure, allowed_count: int) -> str:
    if structure.marker == "circle":
        pattern = LINE_CIRCLE_RE
    elif structure.marker == "letter":
        pattern = LINE_LETTER_RE
    elif structure.marker == "number":
        pattern = LINE_NUMBER_RE
    else:
        return text

    kept = 0
    result: list[str] = []
    for line in text.splitlines():
        if pattern.search(line):
            kept += 1
            if kept > allowed_count:
                continue
        result.append(line)
    return "\n".join(result).strip()


def _trim_inline_markers(text: str, pattern: re.Pattern[str], allowed_count: int) -> str:
    matches = list(pattern.finditer(text))
    if len(matches) <= allowed_count:
        return text

    end = matches[allowed_count].start()
    trimmed = text[:end].rstrip(" ;,\n\t")
    return trimmed.strip()


def _plain_option_line_count(lines: list[str]) -> int:
    if len(lines) < 3:
        return 0
    first_line = lines[0]
    if not CHOICE_TASK_RE.search(first_line):
        return 0

    options = []
    for line in lines[1:]:
        if not SHORT_OPTION_LINE_RE.match(line):
            continue
        if LINE_CIRCLE_RE.search(line) or LINE_LETTER_RE.search(line) or LINE_NUMBER_RE.search(line):
            continue
        options.append(line)

    return len(options) if len(options) >= 2 else 0


def _split_inline_markers(text: str, pattern: re.Pattern[str]) -> str:
    matches = list(pattern.finditer(text))
    if len(matches) < 2:
        return text

    result: list[str] = []
    prefix = text[: matches[0].start()].strip()
    if prefix:
        result.append(prefix)

    for index, match in enumerate(matches):
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        option = text[start:end].strip()
        if option:
            result.append(option)

    return "\n".join(part.strip() for part in result if part.strip())
