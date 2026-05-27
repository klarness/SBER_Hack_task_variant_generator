import re


SYNONYM_TASK_RE = re.compile(r"\b(синоним|синонимы|синонимич)\b", re.IGNORECASE)
SYNONYM_TARGET_PATTERNS = [
    re.compile(
        r"синоним(?:ы|а|ов)?\s+к\s+слову\s*:?\s*[\n\r ]+([А-ЯЁA-Z][А-Яа-яЁёA-Za-z-]{2,})",
        re.IGNORECASE,
    ),
    re.compile(
        r"синоним(?:ы|а|ов)?\s+к\s+слову\s*:?\s*([А-ЯЁA-Z][А-Яа-яЁёA-Za-z-]{2,})",
        re.IGNORECASE,
    ),
    re.compile(r"^\s*([А-ЯЁA-Z][А-Яа-яЁёA-Za-z-]{2,})\s*[-—_]+", re.MULTILINE),
]

SYNONYM_GROUPS = [
    {"храбрый", "смелый", "отважный", "бесстрашный", "мужественный"},
    {"красивый", "прекрасный", "чудесный", "великолепный", "живописный"},
    {"большой", "огромный", "крупный", "громадный", "гигантский"},
    {"маленький", "небольшой", "малый", "крошечный", "миниатюрный"},
    {"быстрый", "скорый", "стремительный", "проворный", "резвый"},
    {"медленный", "неторопливый", "неспешный"},
    {"грустный", "печальный", "унылый", "тоскливый"},
    {"радостный", "веселый", "счастливый", "ликующий"},
    {"умный", "разумный", "сообразительный", "смышленый"},
    {"глупый", "неразумный", "несообразительный"},
    {"трудный", "сложный", "тяжелый", "непростой"},
    {"простой", "легкий", "несложный"},
    {"хороший", "отличный", "замечательный", "прекрасный"},
    {"плохой", "дурной", "скверный", "неудачный"},
    {"тихий", "беззвучный", "молчаливый", "спокойный"},
    {"громкий", "звонкий", "шумный"},
]

SYNONYM_GROUP_BY_WORD = {word: group for group in SYNONYM_GROUPS for word in group}


def lexical_variation_is_valid(original: str, generated: str, previous_variants: list[str]) -> bool:
    if not _is_synonym_task(original):
        return True

    generated_target = extract_synonym_target(generated)
    if not generated_target:
        return True

    related_targets = [extract_synonym_target(original)]
    related_targets.extend(extract_synonym_target(previous) for previous in previous_variants)
    related_targets = [target for target in related_targets if target]

    return not any(_same_synonym_group(generated_target, target) for target in related_targets)


def render_lexical_uniqueness_hint(source: str, previous_variants: list[str]) -> str:
    if not _is_synonym_task(source):
        return (
            "Специальных правил нет. Общий принцип: новый вариант должен менять "
            "проверяемый объект так, чтобы ожидаемый ответ не совпадал по смыслу "
            "с оригиналом и предыдущими вариантами."
        )

    targets = [extract_synonym_target(source)]
    targets.extend(extract_synonym_target(previous) for previous in previous_variants)
    targets = [target for target in targets if target]
    forbidden = sorted(_related_synonym_words(targets))

    if not targets:
        return (
            "Это задание на подбор синонима. Меняй исходное слово на слово из "
            "другого синонимического ряда, чтобы ожидаемый ответ был другим."
        )

    return (
        "Это задание на подбор синонима. "
        f"Уже использованы слова: {', '.join(targets)}. "
        "Новое исходное слово не должно быть их синонимом и не должно давать тот же ожидаемый ответ. "
        f"Не используй этот ряд: {', '.join(forbidden) if forbidden else ', '.join(targets)}."
    )


def extract_synonym_target(text: str) -> str:
    if not _is_synonym_task(text):
        return ""

    for pattern in SYNONYM_TARGET_PATTERNS:
        match = pattern.search(text)
        if match:
            return _normalize_word(match.group(1))
    return ""


def _is_synonym_task(text: str) -> bool:
    return bool(SYNONYM_TASK_RE.search(str(text or "")))


def _same_synonym_group(left: str, right: str) -> bool:
    left = _normalize_word(left)
    right = _normalize_word(right)
    if not left or not right:
        return False
    if left == right:
        return True

    left_group = SYNONYM_GROUP_BY_WORD.get(left)
    return bool(left_group and right in left_group)


def _related_synonym_words(words: list[str]) -> set[str]:
    related: set[str] = set()
    for word in words:
        normalized = _normalize_word(word)
        group = SYNONYM_GROUP_BY_WORD.get(normalized)
        if group:
            related.update(group)
        elif normalized:
            related.add(normalized)
    return related


def _normalize_word(word: str) -> str:
    return re.sub(r"[^а-яёa-z-]", "", str(word or "").strip().casefold())
