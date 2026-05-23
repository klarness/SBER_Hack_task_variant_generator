from analyze.services.llm.client import GigaChatClient
from analyze.services.parsing.tesseract_ocr import TesseractOCR


class ImageParser:
    def __init__(self):
        self.gigachat = GigaChatClient()
        self.tesseract = TesseractOCR()

    async def parse(self, image_bytes: bytes, image_type: str = "png") -> str:
        local_result = self.tesseract.extract_text(image_bytes)
        if local_result.accepted:
            return local_result.text

        return await self.gigachat.extract_text_from_image(image_bytes, image_type=image_type)
