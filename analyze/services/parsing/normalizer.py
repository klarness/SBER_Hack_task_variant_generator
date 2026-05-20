import re


class TextNormalizer:
    @staticmethod
    def normalize(text: str) -> str:
        text = text.replace("\x00", "")

        text = TextNormalizer._replace_unicode_punctuation(text)
        text = TextNormalizer._remove_page_meta(text)
        text = TextNormalizer._remove_ocr_artifacts(text)
        text = TextNormalizer._normalize_choice_markers(text)

        text = re.sub(r"-\n(?=\w)", "", text)
        text = re.sub(r"\r\n?", "\n", text)

        # Сохраняем разрывы абзацев, но убираем лишние пробелы
        text = re.sub(r"[ \t]+\n", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)

        # Сводим подряд идущие пробельные символы внутри строки
        text = re.sub(r"[ \t]{2,}", " ", text)

        return text.strip()

    @staticmethod
    def _replace_unicode_punctuation(text: str) -> str:
        replacements = {
            "“": '"',
            "”": '"',
            "«": '"',
            "»": '"',
            "‘": "'",
            "’": "'",
            "—": "-",
            "–": "-",
            "…": "...",
            "\u00a0": " ",
        }
        for src, dst in replacements.items():
            text = text.replace(src, dst)
        return text

    @staticmethod
    def _remove_page_meta(text: str) -> str:
        patterns = [
            r"(?m)^\s*Страница\s*\d+\s*$",
            r"(?m)^\s*Page\s*\d+\s*$",
            r"(?m)^\s*№\s*\d+\s*$",
            r"(?m)^\s*Лист\s*\d+\s*$",
            r"(?m)^\s*©.*$",
        ]
        for pattern in patterns:
            text = re.sub(pattern, "", text)
        return text

    @staticmethod
    def _remove_ocr_artifacts(text: str) -> str:
        artifact_patterns = [
            r"¶",
            r"†",
            r"•",
            r"¤",
            r"�",
            r"\|{2,}",
            r"\-{3,}",
        ]
        for pattern in artifact_patterns:
            text = re.sub(pattern, " ", text)
        return text

    @staticmethod
    def _normalize_choice_markers(text: str) -> str:
        replacements = {
            "A": "А",
            "B": "В",
            "V": "В",
        }

        for source, target in replacements.items():
            text = re.sub(
                rf"(^|[\s;:]){source}(?=[.)]\s)",
                rf"\1{target}",
                text,
                flags=re.MULTILINE,
            )

        return text
