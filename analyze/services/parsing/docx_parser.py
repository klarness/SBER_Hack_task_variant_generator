import asyncio
import io

import docx

from analyze.services.llm.client import GigaChatClient


class DOCXParser:
    def __init__(self):
        self.gigachat = GigaChatClient()
        self.semaphore = asyncio.Semaphore(3)

    async def parse(self, file_bytes: bytes) -> str:
        file_stream = io.BytesIO(file_bytes)

        document = docx.Document(file_stream)

        full_text = []

        for paragraph in document.paragraphs:
            text = paragraph.text.strip()

            if text:
                full_text.append(text)

        image_tasks = []

        for rel in document.part.rels.values():
            if "image" in rel.target_ref:
                image_bytes = rel.target_part.blob

                image_tasks.append(
                    self._extract_image_text_safe(image_bytes)
                )

        if image_tasks:
            image_results = await asyncio.gather(*image_tasks)

            for text in image_results:
                if text:
                    full_text.append(text)

        return " ".join(full_text)

    async def _extract_image_text_safe(self, image_bytes: bytes) -> str:
        async with self.semaphore:
            try:
                return await self.gigachat.extract_text_from_image(image_bytes)
            except Exception as e:
                print(f"DOCX image extraction error: {e}")
                return ""