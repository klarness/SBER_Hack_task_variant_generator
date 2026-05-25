import asyncio
import base64
import json
import os
import re
import time
from typing import Any

from dotenv import load_dotenv
from gigachat import GigaChat
from gigachat.models import Chat, Messages, MessagesRole
from json_repair import repair_json

from analyze.services.llm.prompts.extraction_prompt import EXTRACTION_PROMPT
from analyze.services.llm.prompts.generation_prompts import (
    build_generate_prompt,
    build_validate_prompt,
)
from analyze.services.llm.prompts.subject_prompts import subject_prompt
from analyze.services.normalization.html_text import html_to_prompt_text

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
        subject: str,
        settings: dict[str, Any],
    ) -> dict[str, Any]:
        settings = normalize_generation_settings(settings)
        subject_profile = subject_prompt(subject)
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
                "- items должны покрывать только решаемые задания;\n"
                "- если исходник состоит из нескольких файлов или страниц, разбери все файлы и все страницы;\n"
                "- не останавливайся на первом листе, первом варианте или первой группе заданий;\n"
                "- строки вида === Файл N: имя === используй только как разделители частей одной работы, не включай их в content;\n"
                "- не включай в items титульные страницы, инструкции по выполнению работы, таблицы баллов, критерии оценивания и служебные подписи;\n"
                "- справочные таблицы, тексты, карты, схемы и изображения переноси в context только если они нужны для конкретного задания;\n"
                "- не добавляй новые задания;\n"
                "- context используй только для общего условия;\n"
                "- content должен содержать конкретный вопрос/задание;\n"
                "- порядок заданий сохрани;\n"
                "- если предмет передан учителем, используй его как основной источник истины.\n\n"
                f"Название: {title}\n"
                f"Заявленный предмет: {subject or 'не указан'}\n"
                f"{subject_profile}\n"
                f"Параметры мультипликации:\n{render_generation_settings(settings)}\n"
                f"Исходный текст:\n{original_text}"
            ),
            temperature=0,
        )

    async def generate_variant(self, request: dict[str, Any]) -> str:
        settings = normalize_generation_settings(request.get("settings") or {})
        previous_variants = normalize_previous_variants(request.get("previous_variants"))
        request = sanitize_prompt_request(
            {**request, "settings": settings, "previous_variants": previous_variants}
        )

        settings_text = render_generation_settings(settings)
        previous_variants_text = render_previous_variants(request["previous_variants"])
        subject_profile = subject_prompt(str(request.get("subject") or ""))
        system_prompt, user_prompt = build_generate_prompt(
            request=request,
            settings_text=settings_text,
            previous_variants_text=previous_variants_text,
            strategy=select_generation_strategy(settings),
            subject_profile=subject_profile,
        )

        response = await self.chat_json(
            system=system_prompt,
            user=user_prompt,
            temperature=0.45,
        )
        content = response.get("content")
        if not isinstance(content, str) or not content.strip():
            raise ValueError("GigaChat response does not contain non-empty content.")
        return content.strip()

    async def validate_variant(self, request: dict[str, Any]) -> bool:
        settings = normalize_generation_settings(request.get("settings") or {})
        previous_variants = normalize_previous_variants(request.get("previous_variants"))
        request = sanitize_prompt_request(
            {**request, "settings": settings, "previous_variants": previous_variants}
        )
        if is_duplicate_variant(str(request.get("generated") or ""), request["previous_variants"]):
            return False

        settings_text = render_generation_settings(settings)
        previous_variants_text = render_previous_variants(request["previous_variants"])
        subject_profile = subject_prompt(str(request.get("subject") or ""))
        system_prompt, user_prompt = build_validate_prompt(
            request=request,
            settings_text=settings_text,
            previous_variants_text=previous_variants_text,
            subject_profile=subject_profile,
        )

        response = await self.chat_json(
            system=system_prompt,
            user=user_prompt,
            temperature=0,
        )
        valid = response.get("valid")
        if not isinstance(valid, bool):
            raise ValueError("GigaChat response does not contain boolean valid.")
        return valid

    async def extract_text_from_image(
        self,
        image_bytes: bytes,
        image_type: str = "png",
        *,
        system_prompt: str = EXTRACTION_PROMPT,
        user_prompt: str = "Extract all visible text from the attached image exactly. Return only extracted text.",
    ) -> str:
        normalized_type = "jpeg" if image_type in {"jpg", "jpeg"} else "png"
        extension = "jpg" if normalized_type == "jpeg" else "png"

        content = await self.chat_text_with_attachment(
            system=system_prompt,
            user=user_prompt,
            file_name=f"source.{extension}",
            file_content=image_bytes,
            file_content_type=f"image/{normalized_type}",
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
        user: str,
        temperature: float = 0,
    ) -> dict[str, Any]:
        content = await self.chat_text(system=system, user=user, temperature=temperature)
        return parse_json_object(content)

    async def chat_text(
        self,
        *,
        system: str,
        user: str,
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

    async def chat_text_with_attachment(
        self,
        *,
        system: str,
        user: str,
        file_name: str,
        file_content: bytes,
        file_content_type: str,
        model: str | None = None,
        temperature: float = 0,
    ) -> str:
        async with _REQUEST_LIMITER:
            token = await self._access_token()

            async with GigaChat(
                access_token=token,
                scope=self.scope,
                timeout=self.timeout,
                verify_ssl_certs=self.verify_ssl_certs,
            ) as giga:
                uploaded = await giga.aupload_file(
                    (file_name, file_content, file_content_type),
                    purpose="general",
                )
                try:
                    payload = Chat(
                        model=model or self.model,
                        messages=[
                            Messages(role=MessagesRole.SYSTEM, content=system),
                            Messages(
                                role=MessagesRole.USER,
                                content=user,
                                attachments=[uploaded.id_],
                            ),
                        ],
                        temperature=temperature,
                    )
                    response = await giga.achat(payload)
                finally:
                    try:
                        await giga.adelete_file(uploaded.id_)
                    except Exception:
                        pass

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


def select_generation_strategy(settings: dict[str, Any]) -> str:
    strategy_by_type = {
        "replace_numbers": (
            "Меняй только числовые значения и связанные с ними обозначения. "
            "Не меняй сюжет, тип действия и количество подпунктов."
        ),
        "reorder_enumeration": (
            "Можно переставить порядок однотипных пунктов или условий, если это не меняет смысл. "
            "Не добавляй новые пункты."
        ),
        "synonymize_non_key_wording": (
            "Можно мягко переформулировать неключевые слова. "
            "Термины, формулы, условия и формат задания сохрани."
        ),
        "replace_context": (
            "Можно заменить жизненный или предметный контекст на аналогичный. "
            "Математическую/предметную логику и сложность сохрани."
        ),
        "change_names": (
            "Можно заменить имена, названия объектов и буквенные обозначения. "
            "Числовые зависимости и тип задания сохрани, если другие изменения не разрешены."
        ),
        "change_units": (
            "Можно заменить единицы измерения только так, чтобы сложность и смысл остались сопоставимыми."
        ),
        "reorder_steps": (
            "Можно переставить шаги только в многошаговой инструкции, если новый порядок логически корректен."
        ),
    }
    selected = [
        strategy_by_type[item]
        for item in settings.get("variation_types", [])
        if item in strategy_by_type
    ]
    if not selected:
        selected = [strategy_by_type["replace_numbers"]]
    return "\n".join(f"- {item}" for item in selected)


def normalize_previous_variants(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    variants: list[str] = []
    for item in value:
        text = html_to_prompt_text(str(item)).strip()
        if text:
            variants.append(text)
    return variants


def sanitize_prompt_request(request: dict[str, Any]) -> dict[str, Any]:
    sanitized = dict(request)
    for key in ("source_content", "context", "custom_prompt", "original", "generated"):
        if key in sanitized:
            sanitized[key] = html_to_prompt_text(str(sanitized.get(key) or ""))
    previous_variants = sanitized.get("previous_variants")
    if isinstance(previous_variants, list):
        sanitized["previous_variants"] = [
            text
            for text in (html_to_prompt_text(str(item)) for item in previous_variants)
            if text
        ]
    else:
        sanitized["previous_variants"] = []
    return sanitized


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
