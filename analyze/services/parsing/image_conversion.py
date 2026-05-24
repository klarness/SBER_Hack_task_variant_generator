import os
import re
import subprocess
import tempfile
from html import unescape
from io import BytesIO

from PIL import Image


WMF_CONTENT_TYPES = {
    "image/wmf",
    "image/x-wmf",
    "image/wmf",
    "application/x-msmetafile",
}


def prepare_image_for_ocr(
    image_bytes: bytes,
    *,
    content_type: str = "",
    filename: str = "",
) -> tuple[bytes, str]:
    if is_wmf_image(image_bytes, content_type=content_type, filename=filename):
        converted = _convert_wmf_to_png(image_bytes)
        if converted:
            return converted, "png"
        return b"", ""

    return image_bytes, _image_type_from_content_type(content_type) or _image_type_from_filename(filename) or "png"


def is_wmf_image(image_bytes: bytes, *, content_type: str = "", filename: str = "") -> bool:
    normalized_content_type = content_type.lower().strip()
    normalized_filename = filename.lower().strip()

    return (
        normalized_content_type in WMF_CONTENT_TYPES
        or normalized_filename.endswith(".wmf")
        or image_bytes.startswith(b"\xd7\xcd\xc6\x9a")
    )


def extract_wmf_text(image_bytes: bytes) -> str:
    svg = _convert_wmf_to_svg(image_bytes)
    if not svg:
        return ""

    return _extract_formula_from_svg(svg)


def _convert_wmf_to_svg(image_bytes: bytes) -> str:
    with tempfile.TemporaryDirectory() as temp_dir:
        source_path = os.path.join(temp_dir, "source.wmf")
        output_path = os.path.join(temp_dir, "output.svg")

        with open(source_path, "wb") as source:
            source.write(image_bytes)

        try:
            subprocess.run(
                ["wmf2svg", "-o", output_path, source_path],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                timeout=10,
            )
        except subprocess.CalledProcessError as error:
            stderr = (error.stderr or b"").decode(errors="replace").strip()
            print(f"WMF to SVG conversion failed: {stderr or error}")
            return ""
        except Exception as error:
            print(f"WMF to SVG conversion failed: {error}")
            return ""

        try:
            with open(output_path, "rb") as output:
                return output.read().decode(errors="replace")
        except OSError as error:
            print(f"WMF to SVG conversion output read failed: {error}")
            return ""


def _extract_formula_from_svg(svg: str) -> str:
    text_items = []
    for match in re.finditer(r"<text\b(?P<attrs>[^>]*)>(?P<value>.*?)</text>", svg, flags=re.S):
        attrs = match.group("attrs")
        value = _normalize_svg_text(match.group("value"))
        if not value:
            continue

        position = _svg_text_position(attrs)
        if position is None:
            continue

        text_items.append({"x": position[0], "y": position[1], "text": value, "used": False})

    if not text_items:
        return ""

    formula_tokens = []
    for line in _svg_fraction_lines(svg):
        numerator = [
            item
            for item in text_items
            if not item["used"]
            and line["x1"] - 12 <= item["x"] <= line["x2"] + 12
            and item["y"] < line["y"] - 20
        ]
        denominator = [
            item
            for item in text_items
            if not item["used"]
            and line["x1"] - 12 <= item["x"] <= line["x2"] + 12
            and item["y"] > line["y"] + 35
        ]

        if not numerator or not denominator:
            continue

        numerator_text = "".join(item["text"] for item in sorted(numerator, key=lambda item: item["x"]))
        denominator_text = "".join(item["text"] for item in sorted(denominator, key=lambda item: item["x"]))
        if not numerator_text or not denominator_text:
            continue

        for item in numerator + denominator:
            item["used"] = True

        formula_tokens.append(
            {
                "x": line["x1"],
                "text": f"\\frac{{{numerator_text}}}{{{denominator_text}}}",
            }
        )

    for item in text_items:
        if not item["used"]:
            formula_tokens.append({"x": item["x"], "text": item["text"]})

    expression = "".join(item["text"] for item in sorted(formula_tokens, key=lambda item: item["x"]))
    expression = _normalize_formula_expression(expression)
    if not expression:
        return ""

    suffix = ""
    while expression and expression[-1] in ".;:":
        suffix = expression[-1] + suffix
        expression = expression[:-1]

    if not expression:
        return suffix

    return f"${expression}${suffix}"


def _svg_fraction_lines(svg: str) -> list[dict[str, float]]:
    lines = []
    for match in re.finditer(r"<line\b(?P<attrs>[^>]*)/>", svg, flags=re.S):
        attrs = match.group("attrs")
        x1 = _svg_float_attr(attrs, "x1")
        y1 = _svg_float_attr(attrs, "y1")
        x2 = _svg_float_attr(attrs, "x2")
        y2 = _svg_float_attr(attrs, "y2")
        if x1 is None or y1 is None or x2 is None or y2 is None:
            continue
        if abs(y1 - y2) > 3 or abs(x2 - x1) < 16:
            continue

        lines.append({"x1": min(x1, x2), "x2": max(x1, x2), "y": (y1 + y2) / 2})

    return lines


def _svg_float_attr(attrs: str, name: str) -> float | None:
    match = re.search(rf'{name}="([\d.\-]+)"', attrs)
    if not match:
        return None
    return float(match.group(1))


def _svg_text_position(attrs: str) -> tuple[float, float] | None:
    match = re.search(r'transform="matrix\(([^)]*)\)"', attrs)
    if not match:
        return None

    values = [float(value) for value in re.findall(r"[\d.\-]+", match.group(1))]
    if len(values) < 6:
        return None

    return values[-2], values[-1]


def _normalize_svg_text(value: str) -> str:
    value = re.sub(r"<.*?>", "", value, flags=re.S)
    value = unescape(value).strip()
    value = value.replace("\ufffd", "")
    return value


def _normalize_formula_expression(expression: str) -> str:
    expression = expression.replace(" ", "")
    expression = expression.replace("−", "-")
    expression = expression.replace("–", "-")
    expression = expression.replace("—", "-")
    expression = expression.replace("×", "\\cdot ")
    expression = expression.replace("·", "\\cdot ")
    expression = expression.replace("∙", "\\cdot ")
    expression = re.sub(r"\s+", " ", expression)
    return expression.strip()


def _convert_wmf_to_png(image_bytes: bytes) -> bytes:
    with tempfile.TemporaryDirectory() as temp_dir:
        source_path = os.path.join(temp_dir, "source.wmf")
        output_path = os.path.join(temp_dir, "output.png")

        with open(source_path, "wb") as source:
            source.write(image_bytes)

        try:
            completed = subprocess.run(
                [
                    "wmf2gd",
                    "--maxwidth=2400",
                    "--maxheight=1600",
                    "-t",
                    "png",
                    "-o",
                    output_path,
                    source_path,
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                timeout=10,
            )
        except subprocess.CalledProcessError as error:
            stderr = (error.stderr or b"").decode(errors="replace").strip()
            print(f"WMF to PNG conversion failed: {stderr or error}")
            return b""
        except Exception as error:
            print(f"WMF to PNG conversion failed: {error}")
            return b""

        try:
            with open(output_path, "rb") as output:
                return _prepare_converted_png(output.read())
        except OSError as error:
            print(f"WMF to PNG conversion output read failed: {error}")
            return b""


def _prepare_converted_png(image_bytes: bytes) -> bytes:
    try:
        image = Image.open(BytesIO(image_bytes)).convert("RGBA")
        background = Image.new("RGBA", image.size, "WHITE")
        background.alpha_composite(image)
        image = background.convert("RGB")

        width, height = image.size
        scale = 1
        if height < 180:
            scale = max(scale, int(180 / max(height, 1)) + 1)
        if width < 600:
            scale = max(scale, int(600 / max(width, 1)) + 1)
        scale = min(scale, 12)

        if scale > 1:
            image = image.resize((width * scale, height * scale), Image.Resampling.LANCZOS)

        padded = Image.new("RGB", (image.width + 48, image.height + 48), "WHITE")
        padded.paste(image, (24, 24))

        output = BytesIO()
        padded.save(output, format="PNG")
        return output.getvalue()
    except Exception as error:
        print(f"Converted PNG post-processing failed: {error}")
        return image_bytes


def _image_type_from_content_type(content_type: str) -> str:
    normalized = content_type.lower().strip()
    if normalized in {"image/jpeg", "image/jpg"}:
        return "jpeg"
    if normalized == "image/png":
        return "png"
    return ""


def _image_type_from_filename(filename: str) -> str:
    normalized = filename.lower().strip()
    if normalized.endswith((".jpg", ".jpeg")):
        return "jpeg"
    if normalized.endswith(".png"):
        return "png"
    return ""
