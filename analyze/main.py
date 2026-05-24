import html
import json
import os
import re
from typing import Any

from fastapi import Body, FastAPI, File, Form, HTTPException, Response, UploadFile

from analyze.schemas.response import (
    AnalyzeItem,
    AnalyzeResponse,
    GenerateRequest,
    GenerateResponse,
    ParseResponse,
    ValidateRequest,
    ValidateResponse,
)
from analyze.services.export.docx_exporter import (
    DOCX_CONTENT_TYPE,
    build_task_docx,
    content_disposition,
)
from analyze.services.export.pdf_exporter import PDF_CONTENT_TYPE, build_task_pdf
from analyze.services.llm.client import GigaChatClient
from analyze.services.parsing.math_markup import normalize_math_markup
from analyze.services.parsing.extraction import FileExtractionService
from analyze.services.parsing.normalizer import TextNormalizer

app = FastAPI(title="Analyze Service")

MAX_PARSE_FILE_SIZE = int(os.getenv("MAX_PARSE_FILE_SIZE", str(32 * 1024 * 1024)))

extraction_service = FileExtractionService()
llm_client = GigaChatClient()


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.post("/parse", response_model=ParseResponse)
async def parse(file: UploadFile = File(...)):
    content = await file.read()
    size = len(content)
    await file.seek(0)

    if size > MAX_PARSE_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large: {size} bytes, max allowed is {MAX_PARSE_FILE_SIZE} bytes",
        )

    try:
        raw_text = await extraction_service.parse(file)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"File parsing failed: {exc}") from exc
    normalized_text = TextNormalizer.normalize(raw_text)
    return ParseResponse(raw_text=raw_text, normalized_text=normalized_text)


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    files: list[UploadFile] | None = File(default=None),
    text: str = Form(default=""),
    title: str = Form(default=""),
    subject: str = Form(default=""),
    settings: str = Form(default="{}"),
    user_id: str = Form(default=""),
):
    parsed_parts: list[str] = []

    for file_index, file in enumerate(files or [], start=1):
        filename = file.filename or f"file_{file_index}"
        try:
            raw_text = await extraction_service.parse(file, subject=subject)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"File parsing failed for {filename}: {exc}") from exc
        normalized_text = TextNormalizer.normalize(raw_text)
        if normalized_text:
            parsed_parts.append(f"=== Файл {file_index}: {filename} ===\n{normalized_text}")

    if text.strip():
        parsed_parts.append(f"=== Текст, введенный вручную ===\n{TextNormalizer.normalize(text)}")

    original_text = "\n\n".join(parsed_parts).strip()
    if not original_text:
        raise HTTPException(status_code=400, detail="No text was extracted from request")

    try:
        llm_result = await llm_client.analyze_task(
            original_text=original_text,
            title=title,
            subject=subject,
            settings=_parse_settings(settings),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"GigaChat analyze failed: {exc}") from exc

    return AnalyzeResponse(
        original_text=original_text,
        items=_parse_llm_items(llm_result),
        subject=subject or str(llm_result.get("subject") or ""),
        topic=str(llm_result.get("topic") or ""),
        task_type=str(llm_result.get("task_type") or ""),
        difficulty=str(llm_result.get("difficulty") or ""),
    )


@app.post("/generate", response_model=GenerateResponse)
async def generate(request: GenerateRequest):
    if not request.source_content.strip():
        raise HTTPException(status_code=400, detail="source_content is required")

    try:
        content = await llm_client.generate_variant(request.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"GigaChat generate failed: {exc}") from exc

    return GenerateResponse(content=normalize_math_markup(_plain_text(content)))


@app.post("/validate", response_model=ValidateResponse)
async def validate(request: ValidateRequest):
    try:
        valid = await llm_client.validate_variant(request.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"GigaChat validate failed: {exc}") from exc

    return ValidateResponse(valid=valid)


@app.post("/export")
async def export(task: dict[str, Any] = Body(...), format: str = "docx"):
    export_format = (format or "docx").lower().strip()
    if export_format not in {"docx", "pdf"}:
        raise HTTPException(status_code=400, detail="Unsupported export format. Use docx or pdf.")

    try:
        if export_format == "pdf":
            data, filename, ascii_filename = build_task_pdf(task)
            content_type = PDF_CONTENT_TYPE
        else:
            data, filename, ascii_filename = build_task_docx(task)
            content_type = DOCX_CONTENT_TYPE
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"{export_format.upper()} export failed: {exc}") from exc

    return Response(
        content=data,
        media_type=content_type,
        headers={
            "X-Filename": ascii_filename,
            "Content-Disposition": content_disposition(filename, ascii_filename),
        },
    )


def _parse_settings(settings: str) -> dict[str, Any]:
    try:
        parsed = json.loads(settings or "{}")
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    return {}


def _parse_llm_items(llm_result: dict[str, Any]) -> list[AnalyzeItem]:
    raw_items = llm_result.get("items")
    if not isinstance(raw_items, list) or not raw_items:
        raise HTTPException(status_code=502, detail="GigaChat analyze response does not contain items")

    items: list[AnalyzeItem] = []
    for index, raw_item in enumerate(raw_items, start=1):
        if not isinstance(raw_item, dict):
            raise HTTPException(status_code=502, detail="GigaChat analyze item must be an object")

        content = _first_text(raw_item, "content", "question", "text", "task", "prompt")
        if not content:
            raise HTTPException(status_code=502, detail="GigaChat analyze item content is empty")

        try:
            order = int(raw_item.get("order"))
        except (TypeError, ValueError):
            order = index

        items.append(
            AnalyzeItem(
                order=order,
                context=_first_text(raw_item, "context", "common_context", "instruction"),
                content=content,
            )
        )

    items.sort(key=lambda item: item.order)
    return items


def _first_text(source: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = source.get(key)

        if isinstance(value, str) and value.strip():
            return normalize_math_markup(_plain_text(value))

    return ""


def _plain_text(value: str) -> str:
    text = html.unescape(value)

    replacements = [
        (r"(?is)<\s*br\s*/?\s*>", "\n"),
        (r"(?is)<\s*/\s*p\s*>", "\n"),
        (r"(?is)<\s*li[^>]*>", ""),
        (r"(?is)<\s*/\s*li\s*>", "; "),
        (r"(?is)<\s*/?\s*(ul|ol|p|div|span)[^>]*>", " "),
        (r"(?is)<[^>]+>", ""),
    ]

    for pattern, replacement in replacements:
        text = re.sub(pattern, replacement, text)

    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r";\s*([.;])", r"\1", text)
    text = re.sub(r";\s*$", "", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = _normalize_choice_markers(text)

    return text.strip()


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
