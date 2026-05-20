import io
import imghdr
import zipfile
from typing import Optional

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
        # Read a small head to detect type without loading whole file into memory
        head = await file.read(8192)

        # Detect type from filename, content_type header or content bytes
        file_type = self._detect_file_type(file.filename, file.content_type, head)

        # If we need full content (pdf/docx/image/text), read remainder accordingly
        if file_type in ("pdf", "docx", "png", "jpeg", "gif", "bmp", "tiff", "webp"):
            rest = await file.read()
            content = head + rest
        else:
            # For text or unknown, try to read rest only if needed
            rest = await file.read()
            content = head + rest

        if file_type == "pdf":
            return await self.pdf_parser.parse(content)

        if file_type == "docx":
            return await self.docx_parser.parse(content)

        if file_type in {"png", "jpeg", "gif", "bmp", "tiff", "webp"}:
            return await self.image_parser.parse(content)

        if file_type == "text":
            try:
                return content.decode("utf-8")
            except UnicodeDecodeError:
                raise HTTPException(status_code=400, detail="Invalid text encoding")

        raise HTTPException(status_code=400, detail="Unsupported file type")

    def _detect_file_type(self, filename: Optional[str], content_type: Optional[str], head: bytes) -> Optional[str]:
        name = (filename or "").lower()
        if name.endswith(".pdf"):
            return "pdf"
        if name.endswith(".docx"):
            return "docx"
        if name.endswith((".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".webp")):
            if name.endswith((".jpg", ".jpeg")):
                return "jpeg"
            return name.split(".")[-1]
        if name.endswith(".txt"):
            return "text"

        if content_type:
            ct = content_type.lower()
            if "pdf" in ct:
                return "pdf"
            if "wordprocessingml.document" in ct or "msword" in ct:
                return "docx"
            if ct.startswith("image/"):
                return ct.split("/", 1)[1]
            if ct.startswith("text/"):
                return "text"

        # Magic bytes checks
        if head.startswith(b"%PDF-"):
            return "pdf"

        # docx is a zip containing word/document.xml
        try:
            with io.BytesIO(head) as buf:
                with zipfile.ZipFile(buf) as z:
                    if "word/document.xml" in z.namelist():
                        return "docx"
        except zipfile.BadZipFile:
            pass

        img_type = imghdr.what(None, head)
        if img_type:
            return "jpeg" if img_type == "jpeg" else img_type

        # If head looks like UTF-8 text, treat as text
        try:
            head.decode("utf-8")
            return "text"
        except Exception:
            return None

# from fastapi import HTTPException, UploadFile

# from analyze.services.parsing.docx_parser import DOCXParser
# from analyze.services.parsing.image_parser import ImageParser
# from analyze.services.parsing.pdf_parser import PDFParser


# class FileExtractionService:
#     def __init__(self):
#         self.pdf_parser = PDFParser()
#         self.docx_parser = DOCXParser()
#         self.image_parser = ImageParser()

#     async def parse(self, file: UploadFile) -> str:
#         content = await file.read()

#         filename = file.filename.lower()

#         if filename.endswith(".pdf"):
#             return await self.pdf_parser.parse(content)

#         if filename.endswith(".docx"):
#             return await self.docx_parser.parse(content)

#         if filename.endswith((".png", ".jpg", ".jpeg")):
#             return await self.image_parser.parse(content)

#         if filename.endswith(".txt"):
#             return content.decode("utf-8")

#         raise HTTPException(status_code=400, detail="Unsupported file type")