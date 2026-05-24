import io
import os
import re
from dataclasses import dataclass

import pytesseract
from PIL import Image, ImageOps


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() not in {"0", "false", "no"}


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


@dataclass
class OCRResult:
    text: str
    accepted: bool
    mean_confidence: float


MATH_HEAVY_SUBJECTS = {
    "математика",
    "физика",
    "химия",
    "информатика",
}


class TesseractOCR:
    def __init__(self):
        self.enabled = _env_bool("TESSERACT_OCR_ENABLED", True)
        self.lang = os.getenv("TESSERACT_LANG", "rus+eng")
        self.psm = os.getenv("TESSERACT_PSM", "6")
        self.min_chars = _env_int("TESSERACT_MIN_CHARS", 25)
        self.min_confidence = _env_int("TESSERACT_MIN_CONFIDENCE", 65)

    def extract_text(self, image_bytes: bytes, *, subject: str = "") -> OCRResult:
        if not self.enabled:
            return OCRResult(text="", accepted=False, mean_confidence=0)

        if is_math_heavy_subject(subject):
            return OCRResult(text="", accepted=False, mean_confidence=0)

        try:
            image = Image.open(io.BytesIO(image_bytes))
            image = self._preprocess(image)
            config = f"--oem 3 --psm {self.psm}"

            data = pytesseract.image_to_data(
                image,
                lang=self.lang,
                config=config,
                output_type=pytesseract.Output.DICT,
            )
        except Exception as error:
            print(f"Tesseract OCR error: {error}")
            return OCRResult(text="", accepted=False, mean_confidence=0)

        words: list[str] = []
        confidences: list[float] = []

        for raw_text, raw_confidence in zip(data.get("text", []), data.get("conf", [])):
            text = str(raw_text).strip()
            if not text:
                continue

            words.append(text)

            try:
                confidence = float(raw_confidence)
            except (TypeError, ValueError):
                continue

            if confidence >= 0:
                confidences.append(confidence)

        result_text = self._normalize_text(" ".join(words))
        mean_confidence = sum(confidences) / len(confidences) if confidences else 0
        accepted = (
            len(result_text) >= self.min_chars
            and mean_confidence >= self.min_confidence
        )

        return OCRResult(
            text=result_text,
            accepted=accepted,
            mean_confidence=mean_confidence,
        )

    def _preprocess(self, image: Image.Image) -> Image.Image:
        image = ImageOps.exif_transpose(image)
        image = image.convert("L")

        width, height = image.size
        if max(width, height) < 1800:
            image = image.resize((width * 2, height * 2))

        image = ImageOps.autocontrast(image)
        return image

    def _normalize_text(self, text: str) -> str:
        text = text.replace("\x00", "")
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\s+([,.;:!?])", r"\1", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()


def is_math_heavy_subject(subject: str | None) -> bool:
    normalized = (subject or "").strip().casefold()
    return normalized in MATH_HEAVY_SUBJECTS
