import re


QUESTION_ARTIFACT_RE = re.compile(r"(\?{2,}|\.{2,}\?|[А-Яа-яЁё]\?\s*[,;:.])")
QUESTION_BEFORE_PUNCTUATION_RE = re.compile(r"\?(\s*[,;:.])")
DOTS_QUESTION_BEFORE_PUNCTUATION_RE = re.compile(r"(\.{2,})\?(\s*[,;:.])")
PROMPT_LEAK_RE = re.compile(
    r"(?is)"
    r"[\s.;]*"
    r"(?:"
    r"любые\s+числовые\s+изменения\s+должны\s+сохранять.*"
    r"|можно\s+заменять\s+числа.*"
    r"|сохраняй\s+эквивалентность\s+и\s+сравнимую\s+сложность.*"
    r"|в\s+данном\s+случае\s+(?:подобран|рассчитан|выбран).*"
    r"|так,\s+чтобы\s+.*(?:сложност|уровень|уравнен).*"
    r"|для\s+сохранения\s+уровня\s+сложности.*"
    r"|сохраняя\s+тем\s+самым\s+сложность.*"
    r"|верни\s+строго\s+json.*"
    r"|финальная\s+проверка\s+перед\s+ответом.*"
    r")$"
)
TRAILING_FORMULA_DUPLICATE_RE = re.compile(
    r"(?s)(\$[^$\n]+\$)(?:[\s.;]*\$?[\s.;]*\1)+\s*$"
)


def has_question_artifacts(text: str) -> bool:
    return bool(QUESTION_ARTIFACT_RE.search(str(text or "")))


def filter_stale_artifact_variants(source: str, previous_variants: list[str]) -> list[str]:
    if has_question_artifacts(source):
        return previous_variants
    return [variant for variant in previous_variants if not has_question_artifacts(variant)]


def cleanup_generated_question_artifacts(source: str, generated: str) -> str:
    text = _strip_prompt_leak(str(generated or ""))
    if has_question_artifacts(source):
        return text

    text = DOTS_QUESTION_BEFORE_PUNCTUATION_RE.sub(r"\1\2", text)
    text = QUESTION_BEFORE_PUNCTUATION_RE.sub(r"\1", text)
    return _strip_prompt_leak(text)


def _strip_prompt_leak(text: str) -> str:
    previous = None
    text = str(text or "").rstrip()
    while previous != text:
        previous = text
        text = PROMPT_LEAK_RE.sub("", text).rstrip()
        text = re.sub(r"(\$)\.\$\.\$[^$\n]+\$\s*$", r"\1.", text).rstrip()
        text = re.sub(r"(\$)\.\$[^$\n]+\$\s*$", r"\1.", text).rstrip()
        text = re.sub(r"\$\.\$\.\$([^$\n]+)\$\s*$", r"$\1$", text).rstrip()
        text = re.sub(r"\$\.\$\.\s*([^$\n]+)\s*$", r"$\1", text).rstrip()
        text = re.sub(r"(\$[^$\n]+)\$\1\$\s*$", r"\1$", text).rstrip()
        text = re.sub(r"(\$[^$\n]+)\$\1\s*$", r"\1$", text).rstrip()
        text = TRAILING_FORMULA_DUPLICATE_RE.sub(r"\1", text).rstrip()
        text = re.sub(r"(\$[^$\n]+\$)\s*\.\s*\$\s*$", r"\1.", text).rstrip()
    return text
