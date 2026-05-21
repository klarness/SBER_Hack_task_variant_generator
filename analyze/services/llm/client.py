import asyncio
import base64
import json
import os
import random
import re
import time
from typing import Any

from dotenv import load_dotenv
from gigachat import GigaChat
from json_repair import repair_json

from analyze.services.llm.prompts.extraction_prompt import EXTRACTION_PROMPT

load_dotenv()


def _env_int(name: str, default: int) -> int:
    try:
        return max(1, int(os.getenv(name, str(default))))
    except ValueError:
        return default


_REQUEST_LIMITER = asyncio.Semaphore(_env_int("GIGACHAT_CONCURRENCY", 1))
_TOKEN_LOCK = asyncio.Lock()
_ACCESS_TOKEN: str | None = None
_TOKEN_EXPIRES_AT = 0.0


class GigaChatClient:
    def __init__(self):
        self.credentials: str | None = None
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
            temperature=0,
        )

    async def generate_variant(self, request: dict[str, Any]) -> str:
        settings = normalize_generation_settings(request.get("settings") or {})
        previous_variants = normalize_previous_variants(request.get("previous_variants"))
        request = {**request, "settings": settings, "previous_variants": previous_variants}
        strategy = random.choice(
            [
                "замени числовые данные и проверь, что сложность остается прежней",
                "замени жизненный контекст, но сохрани предметную логику",
                "измени имена, объекты и обозначения",
                "перестрой формулировку условия без изменения дидактической цели",
                "измени порядок перечисления условий или действий, если это не ломает логику",
            ]
        )

        response = await self.chat_json(
            system=(
                "Ты генерируешь новый вариант школьного задания. "
                "Верни только валидный JSON без markdown и пояснений. "
                f"Обязательная стратегия этой попытки: {strategy}. "
                "Каждый вариант должен заметно отличаться от исходного и от типовых минимальных замен."
                "\n\nКРИТИЧЕСКИ ВАЖНО: новый вариант не должен совпадать с уже созданными вариантами для этого же задания. "
                "Не повторяй те же числовые значения, имена, объекты и формулировки, если их можно изменить без потери смысла."
            ),
            user=(
                "Сгенерируй альтернативное задание той же темы, типа и сложности.\n"
                "JSON schema ответа: {\"content\": \"string\"}\n"
                "Правила:\n"
                "- не решай задание;\n"
                "- сохрани дидактическую цель;\n"
                "- не упрощай и не усложняй;\n"
                "- не ограничивайся минимальной заменой одного числа, если настройки разрешают более широкую вариацию;\n"
                "- не добавляй пояснения вне JSON.\n\n"
                f"Параметры мультипликации:\n{render_generation_settings(settings)}\n"
                f"Входные данные JSON:\n{json.dumps(request, ensure_ascii=False)}"
                f"\n\nУже созданные варианты для этого же задания:\n{render_previous_variants(previous_variants)}"
            ),
            temperature=0.7,
        )
        content = response.get("content")
        if not isinstance(content, str) or not content.strip():
            raise ValueError("GigaChat response does not contain non-empty content.")
        return content.strip()

    async def validate_variant(self, request: dict[str, Any]) -> bool:
        settings = normalize_generation_settings(request.get("settings") or {})
        previous_variants = normalize_previous_variants(request.get("previous_variants"))
        if is_duplicate_variant(str(request.get("generated") or ""), previous_variants):
            return False

        request = {**request, "settings": settings, "previous_variants": previous_variants}
        response = await self.chat_json(
            system=(
                "Ты проверяешь качество сгенерированного варианта задания. "
                "Верни только валидный JSON без markdown и пояснений."
                "\n\nКРИТИЧЕСКИ ВАЖНО: верни false, если generated полностью совпадает с любым уже созданным вариантом "
                "для этого же задания или повторяет его без содержательных отличий."
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
                f"\n\nУже созданные варианты для этого же задания:\n{render_previous_variants(previous_variants)}"
            ),
            temperature=0,
        )
        valid = response.get("valid")
        if not isinstance(valid, bool):
            raise ValueError("GigaChat response does not contain boolean valid.")
        return valid

    async def extract_text_from_image(self, image_bytes: bytes) -> str:
        image_base64 = base64.b64encode(image_bytes).decode()
        content = await self.chat_text(
            system=EXTRACTION_PROMPT,
            user=[
                {"type": "text", "text": "Извлеки текст с изображения дословно."},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{image_base64}"},
                },
            ],
            model=self.vision_model,
            temperature=0,
        )
        if not content.strip():
            raise ValueError("Empty OCR result from GigaChat.")
        return content.strip()

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

        async with _REQUEST_LIMITER:
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
        global _ACCESS_TOKEN, _TOKEN_EXPIRES_AT

        if _ACCESS_TOKEN and time.time() < _TOKEN_EXPIRES_AT:
            return _ACCESS_TOKEN

        async with _TOKEN_LOCK:
            if _ACCESS_TOKEN and time.time() < _TOKEN_EXPIRES_AT:
                return _ACCESS_TOKEN

            async with GigaChat(
                credentials=self._credentials(),
                scope=self.scope,
                timeout=self.timeout,
                verify_ssl_certs=self.verify_ssl_certs,
            ) as giga:
                token = await giga.aget_token()

            if token is None or not token.access_token:
                raise ValueError("GigaChat did not return access token.")

            _ACCESS_TOKEN = token.access_token
            _TOKEN_EXPIRES_AT = float(token.expires_at) / 1000 - 60
            return _ACCESS_TOKEN

    def _credentials(self) -> str:
        if not self.credentials:
            self.credentials = resolve_credentials()
        return self.credentials


def resolve_credentials() -> str:
    credentials = os.getenv("GIGACHAT_CREDENTIALS") or os.getenv("GIGACHAT_AUTHORIZATION_KEY")
    if credentials:
        return credentials.removeprefix("Basic ").strip()

    client_secret = os.getenv("GIGACHAT_CLIENT_SECRET")
    if client_secret:
        try:
            decoded = base64.b64decode(client_secret).decode()
            if ":" in decoded:
                return client_secret.strip()
        except Exception:
            pass

    client_id = os.getenv("GIGACHAT_CLIENT_ID")
    if client_id and client_secret:
        return base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()

    raise ValueError(
        "Set GIGACHAT_CREDENTIALS, GIGACHAT_AUTHORIZATION_KEY, "
        "or GIGACHAT_CLIENT_ID + GIGACHAT_CLIENT_SECRET."
    )


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


def normalize_previous_variants(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def render_previous_variants(previous_variants: list[str]) -> str:
    if not previous_variants:
        return "Нет ранее созданных вариантов."
    return "\n\n".join(
        f"Вариант {index}:\n{content}"
        for index, content in enumerate(previous_variants, start=1)
    )


def is_duplicate_variant(generated: str, previous_variants: list[str]) -> bool:
    normalized_generated = normalize_variant_text(generated)
    if not normalized_generated:
        return False
    generated_key = normalize_variant_key(generated)
    generated_signature = multiple_choice_signature(generated)
    generated_tokens = variant_tokens(generated)

    for previous in previous_variants:
        if normalized_generated == normalize_variant_text(previous):
            return True
        if generated_key and generated_key == normalize_variant_key(previous):
            return True
        previous_signature = multiple_choice_signature(previous)
        if generated_signature and generated_signature == previous_signature:
            return True
        if token_similarity(generated_tokens, variant_tokens(previous)) >= 0.95:
            return True
    return False


def normalize_variant_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.casefold()).strip()


def normalize_variant_key(value: str) -> str:
    return "".join(re.findall(r"[0-9a-zа-яё]+", value.casefold()))


def variant_tokens(value: str) -> set[str]:
    return set(re.findall(r"[0-9a-zа-яё]+", value.casefold()))


def token_similarity(left: set[str], right: set[str]) -> float:
    if len(left) < 5 or len(right) < 5:
        return 0
    return len(left & right) / len(left | right)


def multiple_choice_signature(value: str) -> tuple[str, tuple[str, ...]] | None:
    text = normalize_variant_text(value)
    markers = list(re.finditer(r"(?:^|\s)([a-dа-г])\s*[\)\.]", text, flags=re.IGNORECASE))
    if len(markers) < 2:
        return None

    stem = normalize_variant_key(text[: markers[0].start()])
    options: list[str] = []
    for index, marker in enumerate(markers):
        start = marker.end()
        end = markers[index + 1].start() if index + 1 < len(markers) else len(text)
        option = normalize_variant_key(text[start:end])
        if option:
            options.append(option)

    if not stem or len(options) < 2:
        return None
    return stem, tuple(sorted(options))


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
        candidate = cleaned[start : end + 1]

        try:
            value = json.loads(candidate)
        except json.JSONDecodeError:
            value = repair_json(candidate, return_objects=True)

    if not isinstance(value, dict):
        raise ValueError("Expected JSON object from GigaChat.")
    return value


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
