import html
import io
import os
import re
import tempfile
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
from matplotlib.mathtext import math_to_image
from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer

from analyze.services.export.docx_exporter import (
    _ascii_filename,
    _clean_text,
    _html_to_plain_text,
    _int,
    _safe_filename,
)

PDF_CONTENT_TYPE = "application/pdf"
FONT_NAME = "DejaVuSans"
FONT_BOLD_NAME = "DejaVuSans-Bold"


def build_task_pdf(task: dict[str, Any]) -> tuple[bytes, str, str]:
    _register_fonts()

    title = _clean_text(task.get("title")) or "Варианты заданий"
    output = io.BytesIO()
    formula_image_paths: list[str] = []
    document = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=title,
    )

    styles = _styles()
    story: list[Any] = [Paragraph(_pdf_text(title), styles["title"]), Spacer(1, 8 * mm)]
    _add_variants(story, task, styles, formula_image_paths)

    try:
        document.build(story)
    finally:
        for path in formula_image_paths:
            try:
                os.unlink(path)
            except OSError:
                pass

    filename = f"{_safe_filename(title)}-variants.pdf"
    ascii_filename = _ascii_filename(filename)
    return output.getvalue(), filename, ascii_filename


def _register_fonts() -> None:
    if FONT_NAME in pdfmetrics.getRegisteredFontNames():
        return

    candidates = [
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        Path("C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf"),
    ]

    regular = next((path for path in candidates[::2] if path.exists()), None)
    bold = next((path for path in candidates[1::2] if path.exists()), None)
    if regular:
        pdfmetrics.registerFont(TTFont(FONT_NAME, str(regular)))
    if bold:
        pdfmetrics.registerFont(TTFont(FONT_BOLD_NAME, str(bold)))


def _styles() -> dict[str, ParagraphStyle]:
    base_font = FONT_NAME if FONT_NAME in pdfmetrics.getRegisteredFontNames() else "Helvetica"
    bold_font = FONT_BOLD_NAME if FONT_BOLD_NAME in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold"
    return {
        "title": ParagraphStyle(
            "Title",
            fontName=bold_font,
            fontSize=18,
            leading=22,
            alignment=1,
            spaceAfter=8,
        ),
        "variant": ParagraphStyle(
            "Variant",
            fontName=bold_font,
            fontSize=15,
            leading=19,
            alignment=1,
            spaceAfter=8,
        ),
        "item": ParagraphStyle(
            "Item",
            fontName=base_font,
            fontSize=11,
            leading=15,
            spaceAfter=6,
        ),
        "failed": ParagraphStyle(
            "Failed",
            fontName=base_font,
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#b42318"),
            spaceAfter=6,
        ),
    }


def _add_variants(
    story: list[Any],
    task: dict[str, Any],
    styles: dict[str, ParagraphStyle],
    formula_image_paths: list[str],
) -> None:
    variants = task.get("variants") or []
    if not isinstance(variants, list) or not variants:
        story.append(Paragraph("Варианты еще не сформированы.", styles["item"]))
        return

    for index, variant in enumerate(sorted(variants, key=lambda value: _int(value.get("variant_number")) if isinstance(value, dict) else 0)):
        if not isinstance(variant, dict):
            continue
        if index > 0:
            story.append(PageBreak())

        variant_number = _int(variant.get("variant_number")) or index + 1
        story.append(Paragraph(f"Вариант {variant_number}", styles["variant"]))

        items = variant.get("items") or []
        if not isinstance(items, list) or not items:
            story.append(Paragraph("В этом варианте нет заданий.", styles["item"]))
            continue

        for item_index, item in enumerate(items, start=1):
            if not isinstance(item, dict):
                continue

            status = _clean_text(item.get("status")) or "ready"
            content = str(item.get("content") or "").strip()
            if status == "failed":
                error_message = _clean_text(item.get("error_message")) or "Пункт не удалось сгенерировать."
                story.append(
                    Paragraph(
                        _pdf_rich_text(f"{item_index}. Не удалось сгенерировать этот пункт. {error_message}", formula_image_paths),
                        styles["failed"],
                    )
                )
                continue

            if not content:
                story.append(Paragraph(_pdf_text(f"{item_index}. Пустой текст задания."), styles["failed"]))
                continue

            text = _content_to_plain_text(content)
            story.append(Paragraph(_pdf_rich_text(f"{item_index}. {text}", formula_image_paths), styles["item"]))


def _content_to_plain_text(content: str) -> str:
    if re.search(r"<\s*(p|br|strong|b|em|i|u|s|ul|ol|li|table|tr|td|th|h2|h3)\b", content, flags=re.I):
        return _html_to_plain_text(content)
    return _clean_text(content)


def _pdf_text(value: str) -> str:
    text = html.escape(_clean_text(value))
    text = text.replace("\n", "<br/>")
    return text


def _pdf_rich_text(value: str, formula_image_paths: list[str]) -> str:
    text = _clean_invalid_latex_markers(_clean_text(value))
    if not text:
        return ""

    parts: list[str] = []
    last_index = 0
    for match in re.finditer(r"\$([^$]+)\$", text, flags=re.S):
        if match.start() > last_index:
            parts.append(_pdf_text(text[last_index:match.start()].replace("$", "")))

        formula = match.group(1).strip()
        image_markup = _formula_image_markup(formula, formula_image_paths)
        if image_markup:
            parts.append(image_markup)
        else:
            parts.append(_pdf_text(_latex_fallback_text(formula)))
        last_index = match.end()

    if last_index < len(text):
        parts.append(_pdf_text(text[last_index:].replace("$", "")))

    return "".join(parts)


def _clean_invalid_latex_markers(text: str) -> str:
    text = re.sub(r"\.\s*\$\s*\.\s*\$", ".", text)
    text = re.sub(r"\$\s*\.\s*\$", ".", text)
    text = re.sub(r"\$\s*\$", "", text)
    return text


def _formula_image_markup(formula: str, formula_image_paths: list[str]) -> str:
    formula = _normalize_latex_for_mathtext(formula)
    if not formula:
        return ""

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as file:
            path = file.name
        math_to_image(f"${formula}$", path, dpi=180, format="png")
        width_px, height_px = _image_size(path)
        if width_px <= 0 or height_px <= 0:
            os.unlink(path)
            return ""

        max_height_pt = 18
        width_pt = width_px * 72 / 180
        height_pt = height_px * 72 / 180
        scale = min(1.0, max_height_pt / height_pt)
        width_pt = max(6, width_pt * scale)
        height_pt = max(6, height_pt * scale)
        formula_image_paths.append(path)
        return (
            f'<img src="{html.escape(Path(path).as_posix())}" '
            f'width="{width_pt:.2f}" height="{height_pt:.2f}" valign="middle"/>'
        )
    except Exception:
        try:
            if "path" in locals():
                os.unlink(path)
        except OSError:
            pass
        return ""


def _image_size(path: str) -> tuple[int, int]:
    with PILImage.open(path) as image:
        return image.size


def _normalize_latex_for_mathtext(formula: str) -> str:
    formula = formula.replace(r"\,", " ")
    formula = formula.replace(r"\;", " ")
    formula = formula.replace(r"\:", " ")
    formula = formula.replace(r"\!", "")
    formula = formula.replace(r"\left", "")
    formula = formula.replace(r"\right", "")
    formula = re.sub(r"\s+", " ", formula)
    return formula.strip()


def _latex_fallback_text(formula: str) -> str:
    formula = _normalize_latex_for_mathtext(formula)
    formula = re.sub(r"\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}", r"(\1)/(\2)", formula)
    formula = formula.replace(r"\cdot", "·")
    formula = formula.replace(r"\times", "×")
    formula = formula.replace("{", "").replace("}", "")
    formula = formula.replace("\\", "")
    return formula.strip()
