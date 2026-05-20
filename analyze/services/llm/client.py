import base64
import random
import imghdr
import json
import os
import re
import time
import uuid
import asyncio
from typing import Any

from analyze.services.llm.prompts.extraction_prompt import EXTRACTION_PROMPT
import httpx
from dotenv import load_dotenv

load_dotenv()

GIGACHAT_API_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions"
GIGACHAT_AUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"

GIGACHAT_CLIENT_ID = os.getenv("GIGACHAT_CLIENT_ID")
GIGACHAT_CLIENT_SECRET = os.getenv("GIGACHAT_CLIENT_SECRET")
GIGACHAT_SCOPE = os.getenv("GIGACHAT_SCOPE", "GIGACHAT_API_PERS")

if not (GIGACHAT_CLIENT_ID and GIGACHAT_CLIENT_SECRET):
    raise ValueError(
        "Не указаны GIGACHAT_CLIENT_ID/GIGACHAT_CLIENT_SECRET в переменных окружении."
    )


class GigaChatClient:
    def __init__(self):
        self.access_token: str | None = None
        self.token_expires_at: float = 0.0
        self.request_timeout = int(os.getenv("GIGACHAT_TIMEOUT", "300"))
        self.model = os.getenv("GIGACHAT_MODEL", "GigaChat-2-Max")
        self.vision_model = os.getenv("GIGACHAT_VISION_MODEL", self.model )
        self.verify_ssl_certs = os.getenv("GIGACHAT_VERIFY_SSL_CERTS", "true").lower() not in {"0", "false", "no"}

        self.client_id = GIGACHAT_CLIENT_ID
        self.client_secret = GIGACHAT_CLIENT_SECRET

    async def authenticate(self) -> None:
        print("AUTH HEADER =", self._build_authorization_header())
        print("CLIENT_ID RAW =", repr(self.client_id))
        print("CLIENT_SECRET RAW =", repr(self.client_secret))
        print("CLIENT_SECRET EXISTS =", bool(self.client_secret))


        headers = {
            "Authorization": self._build_authorization_header(),
            "RqUID": str(uuid.uuid4()),
            "Content-Type": "application/x-www-form-urlencoded",
        }

        data = {"grant_type": "client_credentials", "scope": GIGACHAT_SCOPE}

        async with httpx.AsyncClient(timeout=120, verify=self.verify_ssl_certs) as client:
            resp = await client.post(GIGACHAT_AUTH_URL, headers=headers, data=data)

        if resp.status_code != 200:
            raise Exception(f"GigaChat auth error: {resp.status_code} — {resp.text}")

        body = resp.json()
        token = body.get("access_token")
        expires_in = body.get("expires_in") or body.get("expires") or 3600
        try:
            expires_in = int(expires_in)
        except Exception:
            expires_in = 3600

        self.access_token = token
        self.token_expires_at = time.time() + max(0, expires_in - 30)

        if not self.access_token:
            raise Exception("Не удалось получить access_token.")
        

    def _build_authorization_header(self) -> str:
        if not self.client_secret:
            raise ValueError("Не задан GIGACHAT_CLIENT_SECRET (Authorization Key)")

        return f"Basic {self.client_secret.strip()}"

    # def _looks_like_base64_credentials(self, token: str) -> bool:
    #     try:
    #         decoded = base64.b64decode(token, validate=True).decode("utf-8")
    #         return ":" in decoded
    #     except Exception:
    #         return False

    async def _ensure_token(self) -> None:
        if not self.access_token or time.time() > (self.token_expires_at - 10):
            await self.authenticate()

    def _guess_image_type(self, image_bytes: bytes) -> str:
        t = imghdr.what(None, image_bytes)
        if t == "jpeg":
            return "jpeg"
        if t in {"png", "gif", "bmp", "tiff", "webp"}:
            return t
        return "png"

    async def upload_image(self, image_bytes: bytes, filename: str, content_type: str) -> str:
        await self._ensure_token()
        headers = {"Authorization": f"Bearer {self.access_token}"}

        data = {
            "purpose": "general"
        }

        async with httpx.AsyncClient(timeout=self.request_timeout, verify=self.verify_ssl_certs) as client:
            files = {"file": (filename, image_bytes, content_type)}

            resp = await client.post(
                "https://gigachat.devices.sberbank.ru/api/v1/files",
                headers=headers,
                data=data,
                files=files
            )

        if resp.status_code != 200:
            raise Exception(f"GigaChat file upload error: {resp.status_code} — {resp.text}")

        result = resp.json()

        file_id = result.get("id") or result.get("file", {}).get("id")
        if not file_id:
            raise Exception(f"No file id in response: {result}")

        return file_id

    async def extract_text_from_image(self, image_bytes: bytes) -> str:
        image_type = self._guess_image_type(image_bytes)
        filename = f"image.{image_type}"
        content_type = f"image/{image_type}"

        file_id = await self.upload_image(image_bytes, filename, content_type)

        result = await self._chat_text(
            system=(
                "Ты OCR-система. "
                "Твоя задача — дословно переписать текст с изображения. "
                "НЕ добавляй, НЕ исправляй, НЕ интерпретируй."
            ),
            user="Перепиши текст с изображения дословно.",
            model=self.vision_model,
            attachments=[file_id],
            temperature=0
        )

        if not result or not result.strip():
            raise ValueError("Empty OCR result from GigaChat")

        return result.strip()

    async def analyze_task(self, *, original_text: str, title: str, settings: dict[str, Any]) -> dict[str, Any]:
        settings = normalize_generation_settings(settings)
        return await self._chat_json(
            system=(
                "Ты анализируешь школьные задания для генератора вариантов. "
                "Верни только валидный JSON без markdown и пояснений."
            ),
            user=(
                "Разбери эталонную работу на атомарные задания и метаданные.\n"
                "JSON schema ответа:\n"
                "{\n"
                '  "subject": "string",\n'
                '  "topic": "string",\n'
                '  "task_type": "problem|test|exercise|question|task",\n'
                '  "difficulty": "easy|medium|hard",\n'
                '  "items": [\n'
                '    {"order": 1, "context": "string", "content": "string"}\n'
                "  ]\n"
                "}\n"
                "Правила:\n"
                "- items должны покрывать весь исходный материал;\n"
                "- не добавляй новые задания;\n"
                "- context используй только для общего условия;\n"
                "- content должен содержать конкретный вопрос/задание;\n"
                "- порядок заданий сохрани.\n\n"
                f"Название: {title}\n"
                f"Параметры мультипликации:\n{render_generation_settings(settings)}\n"
                f"Исходный текст:\n{original_text}"
            ),
            temperature=0,
        )

    async def generate_variant(self, request: dict[str, Any]) -> str:
        settings = normalize_generation_settings(request.get("settings") or {})
        request = {**request, "settings": settings}

        strategies = [
            "Полностью измени сюжет (другой жизненный контекст)",
            "Замени предметную область (математика → покупки / спорт / транспорт)",
            "Измени структуру задачи (перестрой условие)",
            "Замени объекты на принципиально другие",
            "Сделай обратную постановку задачи"
        ]

        strategy = random.choice(strategies)

        response = await self._chat_json(
            system=(
            "Ты генератор вариантов задач. "
            f"Обязательная стратегия генерации: {strategy}"
            "Каждый раз ты ОБЯЗАН создавать заметно отличающийся вариант задания.\n\n"
            "ВАЖНО:\n"
            "- нельзя менять только числа\n"
            "- нельзя делать минимальные правки\n"
            "- каждый новый вариант должен использовать ДРУГОЙ способ переформулировки:\n"
            "  * смена сюжета\n"
            "  * смена контекста (жизненная ситуация)\n"
            "  * смена структуры условия\n"
            "  * замена объектов на принципиально другие\n"
            "  * изменение порядка логики задачи\n\n"
            "Если вариант похож на исходный — он считается ОШИБКОЙ."
            ),
            user=(
                "Сгенерируй альтернативное задание той же темы, типа и сложности.\n"
                "JSON schema ответа: {\"content\": \"string\"}\n"
                "Правила:\n"
                "- не решай задание;\n"
                "- сохрани дидактическую цель;\n"
                "- меняй числовые данные, имена, контекст или порядок объектов;\n"
                "- не упрощай и не усложняй;\n"
                "- не добавляй пояснения вне JSON.\n\n"
                f"Параметры мультипликации:\n{render_generation_settings(settings)}\n"
                f"Входные данные JSON:\n{json.dumps(request, ensure_ascii=False)}"
            ),
            temperature=0.7,
        )
        content = response.get("content")
        if not isinstance(content, str) or not content.strip():
            raise ValueError("GigaChat response does not contain non-empty content.")
        return content.strip()

    async def validate_variant(self, request: dict[str, Any]) -> bool:
        settings = normalize_generation_settings(request.get("settings") or {})
        request = {**request, "settings": settings}
        response = await self._chat_json(
            system=(
                "Ты проверяешь качество сгенерированного варианта задания. "
                "Верни только валидный JSON без markdown и пояснений."
            ),
            user=(
                "Проверь, можно ли принять generated как вариант original.\n"
                "JSON schema ответа: {\"valid\": true}\n"
                "Критерии:\n"
                "- тип задания сохранен;\n"
                "- сложность примерно та же;\n"
                "- задание не является дословной копией;\n"
                "- логика и дидактическая цель сохранены;\n"
                "- формулировка понятна.\n"
                "Важно:\n"
                "- разные числа, имена, объекты и другой правильный ответ допустимы;\n"
                "- не требуй, чтобы generated имел тот же ответ, что original;\n"
                "- верни false только если generated относится к другой теме, содержит решение, "
                "существенно меняет сложность, непонятен или почти дословно копирует original.\n\n"
                f"Параметры мультипликации:\n{render_generation_settings(settings)}\n"
                f"Данные JSON:\n{json.dumps(request, ensure_ascii=False)}"
            ),
            temperature=0,
        )
        valid = response.get("valid")
        if not isinstance(valid, bool):
            raise ValueError("GigaChat response does not contain boolean valid.")
        return valid

    async def _chat_json(
        self,
        *,
        system: str,
        user: str | list[dict[str, Any]],
        temperature: float = 0,
    ) -> dict[str, Any]:
        content = await self._chat_text(system=system, user=user, temperature=temperature)
        return self._parse_json_object(content)

    async def _chat_text(
        self,
        *,
        system: str,
        user: str,
        model: str | None = None,
        temperature: float = 0,
        attachments: list[str] | None = None,
    ) -> str:
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]

        payload = {
            "model": model or self.model,
            "messages": messages,
            "temperature": temperature,
        }
        if attachments is not None:
            payload["attachments"] = attachments
        return await self._request_chat(payload)

    async def _request_chat(self, payload: dict[str, Any]) -> str:
        await self._ensure_token()
        headers = {"Authorization": f"Bearer {self.access_token}", "Content-Type": "application/json"}

        attempts = 0
        while attempts < 2:
            attempts += 1
            try:
                async with httpx.AsyncClient(timeout=self.request_timeout, verify=self.verify_ssl_certs) as client:
                    resp = await client.post(GIGACHAT_API_URL, headers=headers, json=payload)
            except httpx.RequestError as exc:
                if attempts < 2:
                    await asyncio.sleep(1)
                    continue
                raise

            if resp.status_code == 401 and attempts == 1:
                self.access_token = None
                await self._ensure_token()
                headers["Authorization"] = f"Bearer {self.access_token}"
                continue

            if resp.status_code != 200:
                raise Exception(f"GigaChat chat error: {resp.status_code} — {resp.text}")

            try:
                return resp.json()["choices"][0]["message"]["content"]
            except (KeyError, IndexError, ValueError) as e:
                raise Exception(f"Ошибка в структуре ответа GigaChat: {e}")

    def _parse_json_object(self, content: str) -> dict[str, Any]:
        cleaned = content.strip()
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

        try:
            value = json.loads(cleaned)
        except json.JSONDecodeError:
            start = cleaned.find("{")
            end = cleaned.rfind("}")
            if start == -1 or end == -1 or end <= start:
                raise
            value = json.loads(cleaned[start : end + 1])

        if not isinstance(value, dict):
            raise ValueError("Expected JSON object from GigaChat.")
        return value


def normalize_generation_settings(settings: dict[str, Any] | None) -> dict[str, Any]:
    source = settings or {}
    variation_types = _string_list(
        source.get("variation_types")
        or source.get("variation_strategies")
        or source.get("variation")
        or source.get("variations")
    )
    variation_aliases = {
        "numeric": "replace_numbers",
        "synonyms": "synonymize_non_key_wording",
        "context": "replace_context",
        "reorder": "reorder_steps",
    }
    variation_types = [
        variation_aliases.get(variation_type, variation_type)
        for variation_type in variation_types
    ]

    boolean_type_map = {
        "replace_numbers": "replace_numbers",
        "change_numbers": "replace_numbers",
        "reorder_enumeration": "reorder_enumeration",
        "synonymize": "synonymize_non_key_wording",
        "synonymize_non_key_wording": "synonymize_non_key_wording",
        "replace_context": "replace_context",
        "change_context": "replace_context",
        "change_names": "change_names",
        "change_units": "change_units",
        "reorder_steps": "reorder_steps",
    }
    for source_key, variation_type in boolean_type_map.items():
        if source.get(source_key) is True and variation_type not in variation_types:
            variation_types.append(variation_type)

    if not variation_types:
        variation_types = ["replace_numbers", "replace_context", "change_names"]

    number_settings = source.get("numbers")
    if not isinstance(number_settings, dict):
        number_settings = {}

    return {
        "variation_types": variation_types,
        "number_types": _string_list(
            source.get("number_types")
            or number_settings.get("types")
            or ["integers", "decimals", "fractions"]
        ),
        "number_range": source.get("number_range") or number_settings.get("range") or "keep comparable to original",
        "locked_parts": _string_list(
            source.get("locked_parts")
            or source.get("locked_phrases")
            or source.get("protected_fragments")
            or source.get("do_not_change")
        ),
        "preserve_difficulty": _bool(source.get("preserve_difficulty"), True),
        "check_answer_uniqueness": _bool(source.get("check_answer_uniqueness"), False),
    }


def render_generation_settings(settings: dict[str, Any]) -> str:
    variation_descriptions = {
        "replace_numbers": "заменять числовые данные с учетом диапазона и типа чисел",
        "reorder_enumeration": "изменять порядок перечисления условий, объектов или действий",
        "synonymize_non_key_wording": "синонимически заменять неключевые формулировки",
        "replace_context": "заменять ситуацию или пример при сохранении логики",
        "change_names": "заменять имена, названия и обозначения",
        "change_units": "заменять единицы измерения без изменения сложности",
        "reorder_steps": "переставлять шаги в многошаговой инструкции, если это не ломает логику",
    }
    selected = [
        variation_descriptions.get(item, item)
        for item in settings.get("variation_types", [])
    ]
    locked_parts = settings.get("locked_parts") or []

    return "\n".join(
        [
            f"- выбранные типы вариации: {', '.join(selected) if selected else 'не заданы'};",
            f"- типы чисел: {', '.join(settings.get('number_types') or [])};",
            f"- диапазон чисел: {settings.get('number_range')};",
            f"- сохранять сложность: {'да' if settings.get('preserve_difficulty') else 'нет'};",
            f"- запрет на изменение частей условия: {', '.join(locked_parts) if locked_parts else 'не задан'};",
            "- не менять ключевые математические/предметные связи и не добавлять решение в текст задания.",
        ]
    )


def _string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value] if value else []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


def _bool(value: Any, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in {"1", "true", "yes", "y", "да"}
    return bool(value)
