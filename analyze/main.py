from fastapi import FastAPI, File, UploadFile

from analyze.schemas.response import ParseResponse
from analyze.services.parsing.extraction import FileExtractionService
from analyze.services.parsing.normalizer import TextNormalizer


app = FastAPI(title="Parser Service")


extraction_service = FileExtractionService()


@app.post("/parse", response_model=ParseResponse)
async def parse(file: UploadFile = File(...)):
    raw_text = await extraction_service.parse(file)

    normalized_text = TextNormalizer.normalize(raw_text)

    return ParseResponse(
        raw_text=raw_text,
        normalized_text=normalized_text,
    )