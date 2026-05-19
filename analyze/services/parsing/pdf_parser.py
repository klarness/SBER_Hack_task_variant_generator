import asyncio

import fitz

from analyze.services.llm.client import GigaChatClient


class PDFParser:
    def __init__(self):
        self.gigachat = GigaChatClient()
        self.semaphore = asyncio.Semaphore(3)

    async def parse(self, file_bytes: bytes) -> str:
        doc = fitz.open(stream=file_bytes, filetype="pdf")

        full_text = []
        image_tasks = []

        for page_index in range(len(doc)):
            page = doc[page_index]

            page_text = page.get_text().strip()

            if page_text:
                full_text.append(page_text)

            images = page.get_images(full=True)

            for image_info in images:
                xref = image_info[0]

                base_image = doc.extract_image(xref)
                image_bytes = base_image["image"]

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
                print(f"PDF image extraction error: {e}")
                return ""