import re


def _clean_text(text: str) -> str:
    text = text.replace("\u00a0", " ")
    text = text.replace("\r\n", "\n")
    text = text.replace("\r", "\n")

    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)

    return text.strip()


class TXTParser:
    async def parse(self, file_bytes: bytes) -> str:
        text = self._decode_text(file_bytes)

        return _clean_text(text)

    def _decode_text(self, file_bytes: bytes) -> str:
        encodings = [
            "utf-8",
            "utf-8-sig",
            "cp1251",
            "koi8-r",
            "latin-1",
        ]

        for encoding in encodings:
            try:
                return file_bytes.decode(encoding)
            except UnicodeDecodeError:
                continue

        return file_bytes.decode("utf-8", errors="ignore")