from analyze.services.llm.client import GigaChatClient


class ImageParser:
    def __init__(self):
        self.gigachat = GigaChatClient()

    async def parse(self, image_bytes: bytes, image_type: str = "png") -> str:
        return await self.gigachat.extract_text_from_image(image_bytes, image_type=image_type)
