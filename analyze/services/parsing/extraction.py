from fastapi import HTTPException, UploadFile

from analyze.services.parsing.docx_parser import DOCXParser
from analyze.services.parsing.image_parser import ImageParser
from analyze.services.parsing.pdf_parser import PDFParser


class FileExtractionService:
    def __init__(self):
        self.pdf_parser = PDFParser()
        self.docx_parser = DOCXParser()
        self.image_parser = ImageParser()

    async def parse(self, file: UploadFile) -> str:
        content = await file.read()

        filename = file.filename.lower()

        if filename.endswith(".pdf"):
            return await self.pdf_parser.parse(content)

        if filename.endswith(".docx"):
            return await self.docx_parser.parse(content)

        if filename.endswith((".png", ".jpg", ".jpeg")):
            return await self.image_parser.parse(content)

        if filename.endswith(".txt"):
            return content.decode("utf-8")

        raise HTTPException(status_code=400, detail="Unsupported file type")