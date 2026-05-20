import base64
import asyncio
import json
import os
import re
import time
from typing import Any

from dotenv import load_dotenv
from gigachat import GigaChat

from analyze.services.llm.prompts.extraction_prompt import EXTRACTION_PROMPT

load_dotenv()


class GigaChatClient:
    def __init__(self):
        self.credentials: str | None = None
        self.access_token: str | None = None
        self.token_expires_at = 0.0
        self.token_lock = asyncio.Lock()
        self.request_limiter = asyncio.Semaphore(int(os.getenv("GIGACHAT_CONCURRENCY", "1")))
        self.scope = os.getenv("GIGACHAT_SCOPE", "GIGACHAT_API_PERS")
        self.model = os.getenv("GIGACHAT_MODEL", "GigaChat")
        self.vision_model = os.getenv("GIGACHAT_VISION_MODEL", self.model)
        self.timeout = float(os.getenv("GIGACHAT_TIMEOUT", "60.0"))
        self.verify_ssl_certs = os.getenv("GIGACHAT_VERIFY_SSL_CERTS", "true").lower() not in {
            "0",
            "false",
            "no",
        }

    async def analyze_task(
        self,
        *,
        original_text: str,
        title: str,
        settings: dict[str, Any],
    ) -> dict[str, Any]:
        settings = normalize_generation_settings(settings)
        return await self.chat_json(
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
        )

    async def generate_variant(self, request: dict[str, Any]) -> str:
        settings = normalize_generation_settings(request.get("settings") or {})
        request = {**request, "settings": settings}
        response = await self.chat_json(
            system=(
                "Ты генерируешь новый вариант школьного задания. "
                "Верни только валидный JSON без markdown и пояснений."
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
            temperature=0.4,
        )
        content = response.get("content")
        if not isinstance(content, str) or not content.strip():
            raise ValueError("GigaChat response does not contain non-empty content.")
        return content.strip()

    async def validate_variant(self, request: dict[str, Any]) -> bool:
        settings = normalize_generation_settings(request.get("settings") or {})
        request = {**request, "settings": settings}
        response = await self.chat_json(
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
        )
        valid = response.get("valid")
        if not isinstance(valid, bool):
            raise ValueError("GigaChat response does not contain boolean valid.")
        return valid

    async def extract_text_from_image(self, image_bytes: bytes) -> str:
        image_base64 = base64.b64encode(image_bytes).decode()
        return await self.chat_text(
            system=EXTRACTION_PROMPT,
            user=[
                {"type": "text", "text": "Извлеки текст"},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{image_base64}"},
                },
            ],
            model=self.vision_model,
        )

    async def chat_json(
        self,
        *,
        system: str,
        user: str | list[dict[str, Any]],
        temperature: float = 0,
    ) -> dict[str, Any]:
        content = await self.chat_text(system=system, user=user, temperature=temperature)
        return parse_json_object(content)

    async def chat_text(
        self,
        *,
        system: str,
        user: str | list[dict[str, Any]],
        model: str | None = None,
        temperature: float = 0,
    ) -> str:
        payload = {
            "model": model or self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
        }

        async with self.request_limiter:
            token = await self._access_token()

            async with GigaChat(
                access_token=token,
                scope=self.scope,
                timeout=self.timeout,
                verify_ssl_certs=self.verify_ssl_certs,
            ) as giga:
                response = await giga.achat(payload)

        return response.choices[0].message.content

    async def _access_token(self) -> str:
        if self.access_token and time.time() < self.token_expires_at:
            return self.access_token

        async with self.token_lock:
            if self.access_token and time.time() < self.token_expires_at:
                return self.access_token

            async with GigaChat(
                credentials=self._credentials(),
                scope=self.scope,
                timeout=self.timeout,
                verify_ssl_certs=self.verify_ssl_certs,
            ) as giga:
                token = await giga.aget_token()

            if token is None or not token.access_token:
                raise ValueError("GigaChat did not return access token.")

            self.access_token = token.access_token
            self.token_expires_at = float(token.expires_at) / 1000 - 60
            return self.access_token

    def _resolve_credentials(self) -> str:
        credentials = os.getenv("GIGACHAT_CREDENTIALS") or os.getenv("GIGACHAT_AUTHORIZATION_KEY")
        if credentials:
            return credentials.removeprefix("Basic ").strip()

        client_secret = os.getenv("GIGACHAT_CLIENT_SECRET")
        if client_secret:
            # In the current .env this value is already the Authorization Key
            # from GigaChat Studio. Detect this shape and use it directly.
            try:
                decoded = base64.b64decode(client_secret).decode()
                if ":" in decoded:
                    return client_secret.strip()
            except Exception:
                pass

        client_id = os.getenv("GIGACHAT_CLIENT_ID")
        if client_id and client_secret:
            return base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()

        raise ValueError("Set GIGACHAT_CREDENTIALS or GIGACHAT_AUTHORIZATION_KEY.")

    def _credentials(self) -> str:
        if not self.credentials:
            self.credentials = self._resolve_credentials()
        return self.credentials


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
        "change_names": "изменять имена, названия и обозначения",
        "change_units": "изменять единицы измерения без изменения сложности",
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
            f"- проверять совпадение ответов между вариантами: {'да' if settings.get('check_answer_uniqueness') else 'нет'};",
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


def parse_json_object(content: str) -> dict[str, Any]:
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
