import re


SYNONYM_TASK_RE = re.compile(r"\b(синоним|синонимы|синонимич)\b", re.IGNORECASE)
PROSE_REWRITE_TASK_RE = re.compile(
    r"(спишите\s+текст|вставляя\s+пропущенн|расставляя\s+знаки|знаки\s+препинания|пропущенные\s+буквы)",
    re.IGNORECASE,
)
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

THEME_STOPWORDS = {
    "спишите",
    "текст",
    "вставляя",
    "пропущенные",
    "пропущенных",
    "буквы",
    "букв",
    "расставляя",
    "знаки",
    "препинания",
    "укажите",
    "выберите",
    "выпишите",
    "слово",
    "слова",
    "предложение",
    "предложения",
    "задание",
    "вариант",
    "оригинал",
    "который",
    "которая",
    "которое",
    "которые",
    "чтобы",
    "если",
    "есть",
    "нет",
    "уже",
    "очень",
    "снова",
    "потом",
    "каждый",
    "каждому",
    "свой",
    "своя",
    "свои",
    "его",
    "она",
    "они",
    "оно",
    "под",
    "над",
    "при",
    "для",
    "что",
    "как",
    "это",
    "тот",
    "том",
    "по",
    "и",
    "а",
    "в",
    "во",
    "на",
    "с",
    "со",
    "к",
    "ко",
    "из",
    "за",
    "от",
    "до",
    "ни",
    "не",
}

PROSE_MOTIF_GROUPS: dict[str, set[str]] = {
    "forest": {
        "лес",
        "лесу",
        "лесной",
        "лесные",
        "чаща",
        "чаще",
        "опушка",
        "опушке",
        "кустарник",
        "куст",
        "кусты",
        "ветка",
        "ветви",
        "дерево",
        "деревья",
        "мох",
        "тропа",
        "тропинка",
    },
    "animal_family": {
        "волк",
        "волчонок",
        "волчица",
        "кабан",
        "кабаненок",
        "кабанёнок",
        "кабаниха",
        "поросенок",
        "поросёнок",
        "лось",
        "лосенок",
        "лосёнок",
        "лосиха",
        "медведь",
        "медвежонок",
        "медведица",
        "зверек",
        "зверёк",
        "зверята",
        "детеныш",
        "детёныш",
        "мать",
        "мама",
    },
    "spring_nature": {
        "весна",
        "весной",
        "весенний",
        "весенние",
        "почка",
        "почки",
        "бутон",
        "бутоны",
        "подснежник",
        "фиалка",
        "фиалки",
        "цветок",
        "цветы",
        "расцветают",
        "распускаются",
        "сок",
    },
    "learning_movement": {
        "учится",
        "учился",
        "училась",
        "бегать",
        "ходить",
        "ходит",
        "шагать",
        "ступает",
        "спотыкается",
        "лапка",
        "лапки",
        "ножка",
        "ножки",
        "играет",
        "побежал",
        "побежала",
    },
}


def lexical_variation_is_valid(original: str, generated: str, previous_variants: list[str]) -> bool:
    if prose_theme_is_too_similar(original, generated, previous_variants):
        return False

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
    if _is_prose_rewrite_task(source):
        base = (
            "Это длинное текстовое задание на орфографию/пунктуацию. "
            "Сохраняй тип работы с текстом, пропуски букв, скобки и места для знаков препинания, "
            "но меняй микротему, место действия, персонажей и ключевые образы. "
            "Нельзя делать варианты по той же сюжетной схеме с лесом, детенышем животного, матерью, весной и похожими фразами. "
            "Новый текст должен быть самостоятельным: другая ситуация, другой набор существительных и глаголов, другой образный ряд."
        )
        previous_keywords = sorted(_theme_keywords(" ".join(previous_variants)))[:20]
        if previous_keywords:
            return base + f" Не повторяй ключевые темы уже созданных вариантов: {', '.join(previous_keywords)}."
        return base

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


def prose_theme_is_too_similar(original: str, generated: str, previous_variants: list[str]) -> bool:
    if not _is_prose_rewrite_task(original):
        return False

    generated_keywords = _theme_keywords(generated)
    generated_motifs = _prose_motifs(generated)
    if len(generated_keywords) < 8 and not generated_motifs:
        return False

    sources = [original, *previous_variants]
    for source in sources:
        source_keywords = _theme_keywords(source)
        source_motifs = _prose_motifs(source)
        if len(source_keywords) < 8 and not source_motifs:
            continue
        shared_motifs = generated_motifs & source_motifs
        if {"forest", "animal_family"}.issubset(shared_motifs):
            return True
        if len(shared_motifs) >= 2 and _keyword_similarity(generated_keywords, source_keywords) >= 0.12:
            return True
        if _keyword_similarity(generated_keywords, source_keywords) >= 0.28:
            return True

    return False


def _is_prose_rewrite_task(text: str) -> bool:
    text = str(text or "")
    return len(text) >= 140 and bool(PROSE_REWRITE_TASK_RE.search(text))


def _theme_keywords(text: str) -> set[str]:
    normalized = str(text or "").casefold().replace("ё", "е")
    words = re.findall(r"[а-яa-z]{4,}", normalized)
    return {
        word
        for word in words
        if word not in THEME_STOPWORDS and not word.endswith(("ого", "ему", "ыми", "ими"))
    }


def _prose_motifs(text: str) -> set[str]:
    normalized = f" {str(text or '').casefold().replace('ё', 'е')} "
    words = set(re.findall(r"[а-яa-z]{3,}", normalized))
    motifs: set[str] = set()
    for motif, markers in PROSE_MOTIF_GROUPS.items():
        hits = 0
        for marker in markers:
            normalized_marker = marker.casefold().replace("ё", "е")
            if normalized_marker in words or re.search(rf"\b{re.escape(normalized_marker)}[а-я]*\b", normalized):
                hits += 1
        if hits >= 1 and motif in {"forest", "animal_family"}:
            motifs.add(motif)
        elif hits >= 2:
            motifs.add(motif)
    return motifs


def _keyword_similarity(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0
    return len(left & right) / min(len(left), len(right))


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
