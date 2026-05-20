import io
import re
from typing import Any
from urllib.parse import quote

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, RGBColor

DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def build_task_docx(task: dict[str, Any]) -> tuple[bytes, str, str]:
    document = Document()
    _configure_styles(document)

    title = _clean_text(task.get("title")) or "Варианты заданий"
    document.add_heading(title, level=1)

    _add_meta(document, task)
    _add_source_items(document, task)
    _add_variants(document, task)

    output = io.BytesIO()
    document.save(output)

    filename = f"{_safe_filename(title)}-variants.docx"
    ascii_filename = _ascii_filename(filename)
    return output.getvalue(), filename, ascii_filename


def content_disposition(filename: str, ascii_filename: str) -> str:
    return f'attachment; filename="{ascii_filename}"; filename*=UTF-8\'\'{quote(filename)}'


def _configure_styles(document: Document) -> None:
    style = document.styles["Normal"]
    style.font.name = "Arial"
    style.font.size = Pt(11)

    for section in document.sections:
        section.top_margin = Pt(56)
        section.bottom_margin = Pt(56)
        section.left_margin = Pt(56)
        section.right_margin = Pt(56)


def _add_meta(document: Document, task: dict[str, Any]) -> None:
    rows = [
        ("Предмет", task.get("subject")),
        ("Тема", task.get("topic")),
        ("Тип", task.get("task_type")),
        ("Сложность", task.get("difficulty")),
        ("Статус", task.get("status")),
    ]
    rows = [(label, _clean_text(value)) for label, value in rows if _clean_text(value)]
    if not rows:
        return

    table = document.add_table(rows=0, cols=2)
    table.style = "Table Grid"
    for label, value in rows:
        cells = table.add_row().cells
        cells[0].text = label
        cells[1].text = value


def _add_source_items(document: Document, task: dict[str, Any]) -> None:
    items = task.get("task_items") or []
    if not isinstance(items, list) or not items:
        original_text = _clean_text(task.get("original_text"))
        if not original_text:
            return

        document.add_heading("Исходное задание", level=2)
        _add_text_block(document, original_text)
        return

    document.add_heading("Исходные пункты", level=2)
    for item in sorted(items, key=lambda value: _int(value.get("order")) if isinstance(value, dict) else 0):
        if not isinstance(item, dict):
            continue
        order = _int(item.get("order"))
        content = _clean_text(item.get("content"))
        if content:
            _add_numbered_text(document, order, content)


def _add_variants(document: Document, task: dict[str, Any]) -> None:
    variants = task.get("variants") or []
    if not isinstance(variants, list) or not variants:
        document.add_heading("Варианты", level=2)
        document.add_paragraph("Варианты еще не сформированы.")
        return

    for index, variant in enumerate(sorted(variants, key=lambda value: _int(value.get("variant_number")) if isinstance(value, dict) else 0)):
        if not isinstance(variant, dict):
            continue
        if index > 0:
            document.add_page_break()

        variant_number = _int(variant.get("variant_number")) or index + 1
        heading = document.add_heading(f"Вариант {variant_number}", level=2)
        heading.alignment = WD_ALIGN_PARAGRAPH.CENTER

        items = variant.get("items") or []
        if not isinstance(items, list) or not items:
            document.add_paragraph("В этом варианте нет заданий.")
            continue

        for item_index, item in enumerate(items, start=1):
            if not isinstance(item, dict):
                continue

            status = _clean_text(item.get("status")) or "ready"
            content = _clean_text(item.get("content"))
            if status == "failed":
                _add_failed_item(document, item_index, _clean_text(item.get("error_message")))
            elif content:
                _add_numbered_text(document, item_index, content)
            else:
                _add_failed_item(document, item_index, "Пустой текст задания.")


def _add_failed_item(document: Document, index: int, error_message: str) -> None:
    paragraph = document.add_paragraph()
    run = paragraph.add_run(f"{index}. Не удалось сгенерировать этот пункт.")
    run.bold = True
    run.font.color.rgb = RGBColor(192, 57, 43)
    if error_message:
        paragraph.add_run(" ")
        details = paragraph.add_run(error_message)
        details.italic = True
        details.font.color.rgb = RGBColor(192, 57, 43)


def _add_numbered_text(document: Document, index: int, text: str) -> None:
    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        return

    paragraph = document.add_paragraph()
    paragraph.add_run(f"{index}. {lines[0]}")
    for line in lines[1:]:
        paragraph.add_run().add_break()
        paragraph.add_run(line)


def _add_text_block(document: Document, text: str) -> None:
    for part in re.split(r"\n{2,}", text):
        part = part.strip()
        if part:
            document.add_paragraph(part)


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value)
    text = text.replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _safe_filename(value: str) -> str:
    value = _clean_text(value)
    value = re.sub(r'[<>:"/\\|?*\x00-\x1F]+', "-", value)
    value = re.sub(r"\s+", " ", value).strip(" .-_")
    return (value[:80].strip(" .-_") or "task")


def _ascii_filename(filename: str) -> str:
    stem, dot, suffix = filename.rpartition(".")
    ascii_stem = stem.encode("ascii", errors="ignore").decode()
    ascii_stem = re.sub(r"[^A-Za-z0-9._-]+", "-", ascii_stem).strip("-._")
    if not ascii_stem:
        ascii_stem = "task-variants"
    if dot and suffix:
        return f"{ascii_stem}.{suffix}"
    return ascii_stem


def _int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0
