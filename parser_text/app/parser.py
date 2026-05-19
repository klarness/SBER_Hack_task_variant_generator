from io import BytesIO
import zipfile

import fitz  # PyMuPDF
import docx

import numpy as np
import easyocr
from PIL import Image

reader = easyocr.Reader(['ru', 'en'])


# ----------------------------
# IMAGE OCR (общая функция)
# ----------------------------
def ocr_image(image: Image.Image) -> str:
    image_np = np.array(image)
    result = reader.readtext(image_np, detail=0)
    return "\n".join(result)


# ----------------------------
# PDF -> images -> OCR
# ----------------------------
def parse_pdf(file_bytes: bytes) -> str:
    doc = fitz.open(stream=file_bytes, filetype="pdf")

    full_text = []

    for page in doc:
        # рендер страницы в изображение
        pix = page.get_pixmap(dpi=200)
        img_bytes = pix.tobytes("png")

        image = Image.open(BytesIO(img_bytes))

        text = ocr_image(image)

        if text.strip():
            full_text.append(text)

    return "\n".join(full_text)


# ----------------------------
# DOCX -> images -> OCR
# ----------------------------
def parse_docx(file_bytes: bytes) -> str:
    doc = docx.Document(BytesIO(file_bytes))

    text_parts = [p.text for p in doc.paragraphs if p.text.strip()]
    images_text = []

    with zipfile.ZipFile(BytesIO(file_bytes)) as z:
        for file in z.namelist():
            if file.startswith("word/media/"):
                img_bytes = z.read(file)

                image = Image.open(BytesIO(img_bytes))

                text = ocr_image(image)

                if text.strip():
                    images_text.append(text)

    return "\n".join(text_parts + images_text)


# ----------------------------
# IMAGE file -> OCR
# ----------------------------
def parse_image(file_bytes: bytes) -> str:
    image = Image.open(BytesIO(file_bytes))
    return ocr_image(image)