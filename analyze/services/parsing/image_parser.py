from analyze.services.llm.client import GigaChatClient
from analyze.services.llm.prompts.extraction_prompt import MATH_EXTRACTION_PROMPT
from analyze.services.parsing.image_conversion import extract_wmf_text, is_wmf_image, prepare_image_for_ocr
from analyze.services.parsing.tesseract_ocr import TesseractOCR, is_math_heavy_subject


class ImageParser:
    def __init__(self):
        self.gigachat = GigaChatClient()
        self.tesseract = TesseractOCR()

    async def parse(self, image_bytes: bytes, image_type: str = "png", subject: str = "") -> str:
        if is_wmf_image(image_bytes, content_type=f"image/{image_type}"):
            wmf_text = extract_wmf_text(image_bytes)
            if wmf_text:
                return wmf_text

        image_bytes, image_type = prepare_image_for_ocr(
            image_bytes,
            content_type=f"image/{image_type}",
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
