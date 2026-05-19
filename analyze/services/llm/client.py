import base64
import os
import uuid
from analyze.services.llm.prompts.extraction_prompt import EXTRACTION_PROMPT
import httpx
from dotenv import load_dotenv

GIGACHAT_API_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions"
GIGACHAT_AUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"

# Загружаем переменные из .env в текущей папке
load_dotenv() 

# Теперь можно получать переменные
GIGACHAT_CLIENT_ID = os.getenv("GIGACHAT_CLIENT_ID")
GIGACHAT_CLIENT_SECRET = os.getenv("GIGACHAT_CLIENT_SECRET")
GIGACHAT_SCOPE = "GIGACHAT_API_PERS"

if not GIGACHAT_CLIENT_ID or not GIGACHAT_CLIENT_SECRET:
    raise ValueError("Не указаны GIGACHAT_CLIENT_ID или GIGACHAT_CLIENT_SECRET в переменных окружения.")



if not GIGACHAT_CLIENT_ID or not GIGACHAT_CLIENT_SECRET:
    raise ValueError("Не указаны GIGACHAT_CLIENT_ID или GIGACHAT_CLIENT_SECRET в переменных окружения.")

class GigaChatClient:
    def __init__(self):
        self.access_token = None

    async def authenticate(self):
        headers = {
            "Authorization": f"Basic {self._build_basic_auth()}",
            "RqUID": str(uuid.uuid4()),
            "Content-Type": "application/x-www-form-urlencoded",
        }

        data = {
            "grant_type": "client_credentials",
            "scope": GIGACHAT_SCOPE,
        }

        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                GIGACHAT_AUTH_URL,
                headers=headers,
                data=data,
                # verify=True  # По умолчанию True, если не указано иначе
            )
            
        if response.status_code != 200:
            raise Exception(f"GigaChat auth error: {response.status_code} — {response.text}")

        self.access_token = response.json().get("access_token")
        if not self.access_token:
            raise Exception("Не удалось получить access_token.")

    def _build_basic_auth(self):
        auth_string = f"{GIGACHAT_CLIENT_ID}:{GIGACHAT_CLIENT_SECRET}"
        return base64.b64encode(auth_string.encode()).decode()

    async def extract_text_from_image(self, image_bytes: bytes) -> str:
        if not self.access_token:
            await self.authenticate()

        image_base64 = base64.b64encode(image_bytes).decode()

        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": "GigaChat-2-Max",
            "messages": [
                {
                    "role": "system",
                    "content": EXTRACTION_PROMPT
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "Извлеки текст"
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{image_base64}"
                            }
                        }
                    ]
                }
            ],
            "temperature": 0,
        }

        async with httpx.AsyncClient(timeout=300) as client:
            response = await client.post(
                GIGACHAT_API_URL,
                headers=headers,
                json=payload,
                # verify=True  # По умолчанию True
            )

        if response.status_code != 200:
            raise Exception(f"GigaChat extraction error: {response.status_code} — {response.text}")

        try:
            return response.json()["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as e:
            raise Exception(f"Ошибка в структуре ответа GigaChat: {e}")