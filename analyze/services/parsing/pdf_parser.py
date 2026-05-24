import asyncio
import io
import os
import re
import statistics
import unicodedata

import fitz
import pdfplumber

from analyze.services.llm.client import GigaChatClient
from analyze.services.llm.prompts.extraction_prompt import MATH_EXTRACTION_PROMPT
from analyze.services.parsing.image_conversion import extract_wmf_text, is_wmf_image, prepare_image_for_ocr
from analyze.services.parsing.tesseract_ocr import TesseractOCR, is_math_heavy_subject


PDF_LINE_Y_TOLERANCE = 11.0
PDF_MATH_OCR_DPI = int(os.getenv("PDF_MATH_OCR_DPI", "220"))
PDF_MATH_OCR_ENABLED = os.getenv("PDF_MATH_OCR_ENABLED", "true").lower() not in {
    "0",
    "false",
    "no",
}
PDF_TESSERACT_OCR_ENABLED = os.getenv("PDF_TESSERACT_OCR_ENABLED", "true").lower() not in {
    "0",
    "false",
    "no",
}


def _normalize_pdf_token(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)

    replacements = {
        "\u2212": "-",
        "\u2013": "-",
        "\u2014": "-",
        "\u00d7": "*",
        "\u2219": "*",
        "\u22c5": "*",
        "\u00b7": "*",
    }

    for source, target in replacements.items():
        text = text.replace(source, target)

    return text


def _normalize_pdf_line(text: str) -> str:
    text = _normalize_pdf_token(text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"(?<=[A-Za-z])\s*(\d+)(?=[A-Za-z+\-*/=);,\s]|$)", r"^\1", text)
    text = re.sub(r"(?<=\))\s*(\d+)(?=[;,\s]|$)", r"^\1", text)
    text = re.sub(r"\s*([+\-*/=])\s*", r"\1", text)
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"\(\s+", "(", text)
    text = re.sub(r"\s+\)", ")", text)
    text = re.sub(r"([\u0430-\u044f\u0451]\))(?=\S)", r"\1 ", text, flags=re.IGNORECASE)

    return text.strip()


def _merge_pdf_lines(lines: list[str]) -> list[str]:
    merged = []

    for line in lines:
        if not line:
            continue

        if merged and _should_append_to_previous(merged[-1], line):
            separator = "" if line in {".", ",", ";", ":", ")"} else " "
            merged[-1] = _normalize_pdf_line(f"{merged[-1]}{separator}{line}")
            continue

        merged.append(line)

    return merged


def _should_append_to_previous(previous: str, current: str) -> bool:
    if current in {".", ",", ";", ":", ")"}:
        return True

    if re.search(r"[\u0430-\u044f\u0451]\)$", previous, flags=re.IGNORECASE):
        return True

    if previous.count("(") > previous.count(")"):
        return True

    return False


def _compact_pdf_line(text: str) -> str:
    text = _normalize_pdf_line(text)
    text = re.sub(r"(?<=[A-Za-z0-9])\s+(?=[+\-*/^=;:.,)])", "", text)
    text = re.sub(r"(?<=[+\-*/^=(])\s+(?=[A-Za-z0-9(])", "", text)
    text = re.sub(r"(?<=[A-Za-z0-9)])\s+(?=[+\-*/^=])", "", text)
    text = re.sub(r"(?<=[A-Za-z0-9)])\s+(?=\()", "", text)

    return text.strip()


class PDFParser:
    def __init__(self):
        self.gigachat = GigaChatClient()
        self.tesseract = TesseractOCR()
        self.semaphore = asyncio.Semaphore(3)

    async def parse(self, file_bytes: bytes, subject: str = "") -> str:
        doc = fitz.open(stream=file_bytes, filetype="pdf")

        if PDF_MATH_OCR_ENABLED:
            ocr_text = await self._extract_pages_with_math_ocr(doc)
            if ocr_text:
                return ocr_text

        full_text = []
        image_tasks = []
        extracted_text = self._extract_text_with_pdfplumber(file_bytes)

        if extracted_text:
            full_text.append(extracted_text)
        elif PDF_TESSERACT_OCR_ENABLED:
            ocr_text = await self._extract_pages_with_tesseract_ocr(doc, subject=subject)
            if ocr_text:
                return ocr_text

        for page_index in range(len(doc)):
            page = doc[page_index]

            page_text = "" if extracted_text else self._extract_page_text(page)

            if page_text:
                full_text.append(page_text)

            images = page.get_images(full=True)

            for image_info in images:
                xref = image_info[0]

                base_image = doc.extract_image(xref)
                image_bytes = base_image["image"]
                image_ext = base_image.get("ext", "")

                image_tasks.append(
                    self._extract_image_text_safe(
                        image_bytes,
                        subject=subject,
                        filename=f"image.{image_ext}" if image_ext else "",
                    )
                )

        if image_tasks:
            image_results = await asyncio.gather(*image_tasks)

            for text in image_results:
                if text:
                    full_text.append(text)

        return "\n".join(full_text)

    async def _extract_pages_with_math_ocr(self, doc: fitz.Document) -> str:
        page_tasks = [
            self._extract_page_with_math_ocr_safe(page)
            for page in doc
        ]
        if not page_tasks:
            return ""

        page_results = await asyncio.gather(*page_tasks)
        return "\n\n".join(text for text in page_results if text)

    async def _extract_pages_with_tesseract_ocr(self, doc: fitz.Document, subject: str = "") -> str:
        page_tasks = [
            self._extract_page_with_tesseract_ocr_safe(page, subject=subject)
            for page in doc
        ]
        if not page_tasks:
            return ""

        page_results = await asyncio.gather(*page_tasks)
        return "\n\n".join(text for text in page_results if text)

    async def _extract_page_with_tesseract_ocr_safe(self, page: fitz.Page, subject: str = "") -> str:
        async with self.semaphore:
            try:
                image_bytes = self._render_page_to_png(page)
                result = self.tesseract.extract_text(image_bytes, subject=subject)
                return result.text if result.accepted else ""
            except Exception as error:
                print(f"PDF page Tesseract OCR error on page {page.number + 1}: {error}")
                return ""

    async def _extract_page_with_math_ocr_safe(self, page: fitz.Page) -> str:
        async with self.semaphore:
            try:
                image_bytes = self._render_page_to_png(page)
                return await self.gigachat.extract_text_from_image(
                    image_bytes,
                    image_type="png",
                    system_prompt=MATH_EXTRACTION_PROMPT,
                    user_prompt=(
                        "Распознай страницу PDF. Верни весь текст, а все формулы и математические выражения "
                        "оформи в LaTeX внутри $...$. Не решай задания."
                    ),
                )
            except Exception as error:
                print(f"PDF page math OCR error on page {page.number + 1}: {error}")
                return ""

    def _render_page_to_png(self, page: fitz.Page) -> bytes:
        zoom = PDF_MATH_OCR_DPI / 72
        matrix = fitz.Matrix(zoom, zoom)
        pixmap = page.get_pixmap(matrix=matrix, alpha=False)
        return pixmap.tobytes("png")

    def _extract_text_with_pdfplumber(self, file_bytes: bytes) -> str:
        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                pages = []

                for page in pdf.pages:
                    text = page.extract_text(
                        x_tolerance=2,
                        y_tolerance=7,
                        layout=True,
                    )
                    normalized_text = self._normalize_pdfplumber_text(text or "")

                    if normalized_text:
                        pages.append(normalized_text)

                return "\n".join(pages)
        except Exception as error:
            print(f"PDF pdfplumber text extraction error: {error}")
            return ""

    def _normalize_pdfplumber_text(self, text: str) -> str:
        lines = [
            _normalize_pdf_line(line)
            for line in text.splitlines()
            if line.strip()
        ]

        return "\n".join(_merge_pdf_lines(lines))

    def _extract_page_text(self, page: fitz.Page) -> str:
        words = page.get_text("words")

        if not words:
            return page.get_text().strip()

        rows = self._group_words_by_visual_line(words)
        lines = []

        for row in rows:
            line = self._row_to_text(row)

            if line:
                lines.append(line)

        return "\n".join(lines).strip()

    def _group_words_by_visual_line(self, words: list[tuple]) -> list[list[dict]]:
        normalized_words = []

        for word in words:
            x0, y0, x1, y1, text, *_ = word
            normalized_words.append(
                {
                    "x0": x0,
                    "y0": y0,
                    "x1": x1,
                    "y1": y1,
                    "cy": (y0 + y1) / 2,
                    "text": _normalize_pdf_token(text),
                }
            )

        rows: list[dict] = []

        for word in sorted(normalized_words, key=lambda item: (item["cy"], item["x0"])):
            best_row = None
            best_distance = float("inf")

            for row in rows:
                distance = abs(word["cy"] - row["cy"])

                if distance < best_distance:
                    best_row = row
                    best_distance = distance

            if best_row is None or best_distance > PDF_LINE_Y_TOLERANCE:
                rows.append({"cy": word["cy"], "words": [word]})
                continue

            best_row["words"].append(word)
            best_row["cy"] = sum(item["cy"] for item in best_row["words"]) / len(best_row["words"])

        return [
            sorted(row["words"], key=lambda item: item["x0"])
            for row in sorted(rows, key=lambda item: item["cy"])
        ]

    def _row_to_text(self, row: list[dict]) -> str:
        baseline_candidates = [
            item["y0"]
            for item in row
            if re.search(r"[A-Za-z0-9]", item["text"])
            and not re.search(r"[\u0400-\u04FF]", item["text"])
            and item["text"] not in {"(", ")", ";", ":", ","}
        ]
        baseline_y0 = max(baseline_candidates) if baseline_candidates else statistics.median(
            item["y0"] for item in row
        )

        tokens = []

        for item in row:
            text = item["text"]

            if self._is_superscript_word(item, baseline_y0):
                tokens.append(f"^{text}")
                continue

            tokens.append(text)

        return _compact_pdf_line(" ".join(tokens))

    def _is_superscript_word(self, word: dict, baseline_y0: float) -> bool:
        text = word["text"]

        if not re.search(r"[A-Za-z0-9]", text):
            return False

        if re.search(r"[\u0400-\u04FF]", text):
            return False

        if text in {"(", ")", ";", ":", ",", "+", "-", "*", "/", "="}:
            return False

        return word["y0"] < baseline_y0 - 3.0

    async def _extract_image_text_safe(
        self,
        image_bytes: bytes,
        subject: str = "",
        content_type: str = "",
        filename: str = "",
    ) -> str:
        async with self.semaphore:
            try:
                if is_wmf_image(image_bytes, content_type=content_type, filename=filename):
                    wmf_text = extract_wmf_text(image_bytes)
                    if wmf_text:
                        return wmf_text

                image_bytes, image_type = prepare_image_for_ocr(
                    image_bytes,
                    content_type=content_type,
                    filename=filename,
                )
                if not image_bytes or not image_type:
                    return ""

                local_result = self.tesseract.extract_text(image_bytes, subject=subject)
                if local_result.accepted:
                    return local_result.text

                if is_math_heavy_subject(subject):
                    return await self.gigachat.extract_text_from_image(
                        image_bytes,
                        image_type=image_type,
                        system_prompt=MATH_EXTRACTION_PROMPT,
                    )

                return await self.gigachat.extract_text_from_image(image_bytes, image_type=image_type)
            except Exception as e:
                print(f"PDF image extraction error: {e}")
                return ""
