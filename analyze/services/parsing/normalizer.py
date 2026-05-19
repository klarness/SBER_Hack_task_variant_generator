import re


class TextNormalizer:
    @staticmethod
    def normalize(text: str) -> str:
        text = text.replace("\x00", "")

        text = re.sub(r"-\n(?=\w)", "", text)

        text = re.sub(r"\s+", " ", text)

        text = re.sub(r"\n{3,}", "\n\n", text)

        return text.strip()