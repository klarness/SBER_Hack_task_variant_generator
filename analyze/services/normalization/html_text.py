import html
import re


HTML_TAG_RE = re.compile(r"<[^>]+>")


def html_to_prompt_text(value: str) -> str:
    """Convert editor HTML to readable text for LLM prompts without changing stored content."""
    text = html.unescape(str(value or ""))
    if not HTML_TAG_RE.search(text):
        return _clean_prompt_text(text)

    text = _replace_formula_spans(text)

    replacements = [
        (r"(?is)<\s*br\s*/?\s*>", "\n"),
        (r"(?is)<\s*/\s*(p|div|h1|h2|h3|blockquote)\s*>", "\n"),
        (r"(?is)<\s*li[^>]*>", "- "),
        (r"(?is)<\s*/\s*li\s*>", "\n"),
        (r"(?is)<\s*/\s*tr\s*>", "\n"),
        (r"(?is)<\s*/\s*(td|th)\s*>", " | "),
        (r"(?is)<\s*/?\s*(table|thead|tbody|tr|td|th|ul|ol|p|div|span|strong|b|em|i|u|s|strike|h1|h2|h3)[^>]*>", ""),
        (r"(?is)<[^>]+>", ""),
    ]
    for pattern, replacement in replacements:
        text = re.sub(pattern, replacement, text)

    text = re.sub(r"[ \t]+\|", " |", text)
    text = re.sub(r"\|\s+\|", "|", text)
    return _clean_prompt_text(text)


def _replace_formula_spans(text: str) -> str:
    def replace(match: re.Match[str]) -> str:
        attrs = match.group(1) or ""
        body = match.group(2) or ""
        latex_match = re.search(
            r"""data-latex\s*=\s*(['"])(.*?)\1""",
            attrs,
            flags=re.IGNORECASE | re.DOTALL,
        )
        latex = latex_match.group(2).strip() if latex_match else ""
        if latex:
            return f"${latex}$"
        return body

    return re.sub(
        r"(?is)<\s*span\b([^>]*)data-math-formula[^>]*>(.*?)<\s*/\s*span\s*>",
        replace,
        text,
    )


def _clean_prompt_text(text: str) -> str:
    text = text.replace("\x00", "")
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
