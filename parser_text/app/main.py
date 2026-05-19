from fastapi import FastAPI, UploadFile, File, HTTPException

from app.parser import (
    parse_pdf,
    parse_docx,
    parse_image,
)

from app.schemas import ParsedTextResponse
from app.utils import detect_file_type


app = FastAPI(title="parser_text")


@app.post("/parse")
async def parse_text(file: UploadFile = File(...)):
    file_bytes = await file.read()

    mime = detect_file_type(file.filename)

    if mime == "pdf":
        text = parse_pdf(file_bytes)

    elif mime == "docx":
        text = parse_docx(file_bytes)

    elif mime == "image":
        text = parse_image(file_bytes)

    else:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    return {
        "filename": file.filename,
        "file_type": mime,
        "text": text
    }