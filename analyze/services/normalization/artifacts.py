import re


QUESTION_ARTIFACT_RE = re.compile(r"(\?{2,}|\.{2,}\?|[А-Яа-яЁё]\?\s*[,;:.])")
QUESTION_BEFORE_PUNCTUATION_RE = re.compile(r"\?(\s*[,;:.])")
DOTS_QUESTION_BEFORE_PUNCTUATION_RE = re.compile(r"(\.{2,})\?(\s*[,;:.])")


def has_question_artifacts(text: str) -> bool:
    return bool(QUESTION_ARTIFACT_RE.search(str(text or "")))


def filter_stale_artifact_variants(source: str, previous_variants: list[str]) -> list[str]:
    if has_question_artifacts(source):
        return previous_variants
    return [variant for variant in previous_variants if not has_question_artifacts(variant)]


def cleanup_generated_question_artifacts(source: str, generated: str) -> str:
    if has_question_artifacts(source):
        return generated

    text = str(generated or "")
    text = DOTS_QUESTION_BEFORE_PUNCTUATION_RE.sub(r"\1\2", text)
    text = QUESTION_BEFORE_PUNCTUATION_RE.sub(r"\1", text)
    return text
