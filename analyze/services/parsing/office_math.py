import re
from xml.etree import ElementTree


MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math"

MATH_PROPERTY_NODES = {
    "accPr",
    "barPr",
    "boxPr",
    "ctrlPr",
    "dPr",
    "eqArrPr",
    "fPr",
    "funcPr",
    "groupChrPr",
    "limLowPr",
    "limUppPr",
    "mPr",
    "matrixPr",
    "naryPr",
    "phantPr",
    "rPr",
    "radPr",
    "sPrePr",
    "sSubPr",
    "sSubSupPr",
    "sSupPr",
}


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def attribute_value(node: ElementTree.Element, attribute_name: str) -> str:
    for name, value in node.attrib.items():
        if local_name(name) == attribute_name:
            return value
    return ""


def omml_to_latex(node: ElementTree.Element) -> str:
    return _clean_latex(_omml_to_latex(node))


def format_inline_math(latex: str) -> str:
    latex = _clean_latex(latex)
    if not latex:
        return ""

    suffix = ""
    while latex and latex[-1] in ".;":
        suffix = latex[-1] + suffix
        latex = latex[:-1].rstrip()

    return f" ${latex}${suffix} "


def _omml_to_latex(node: ElementTree.Element) -> str:
    name = local_name(node.tag)

    if name == "t":
        return _latex_text(node.text or "")

    if name in MATH_PROPERTY_NODES or name.endswith("Pr"):
        return ""

    if name == "f":
        numerator = _math_child_latex(node, "num")
        denominator = _math_child_latex(node, "den")
        if numerator and denominator:
            return f"\\frac{{{numerator}}}{{{denominator}}}"

    if name == "sSup":
        base = _math_child_latex(node, "e")
        superscript = _math_child_latex(node, "sup")
        if base and superscript:
            return f"{_group_if_needed(base)}^{{{superscript}}}"

    if name == "sSub":
        base = _math_child_latex(node, "e")
        subscript = _math_child_latex(node, "sub")
        if base and subscript:
            return f"{_group_if_needed(base)}_{{{subscript}}}"

    if name == "sSubSup":
        base = _math_child_latex(node, "e")
        subscript = _math_child_latex(node, "sub")
        superscript = _math_child_latex(node, "sup")
        if base and subscript and superscript:
            return f"{_group_if_needed(base)}_{{{subscript}}}^{{{superscript}}}"

    if name == "rad":
        degree = _math_child_latex(node, "deg")
        expression = _math_child_latex(node, "e")
        if expression:
            return f"\\sqrt[{degree}]{{{expression}}}" if degree else f"\\sqrt{{{expression}}}"

    if name == "d":
        expression = _math_child_latex(node, "e")
        start = "("
        end = ")"

        for child in node:
            if local_name(child.tag) != "dPr":
                continue

            for property_node in child:
                property_name = local_name(property_node.tag)
                if property_name == "begChr":
                    start = attribute_value(property_node, "val") or start
                if property_name == "endChr":
                    end = attribute_value(property_node, "val") or end

        return f"{start}{expression}{end}" if expression else ""

    if name == "nary":
        operator = _math_child_latex(node, "chr") or "\\sum"
        lower = _math_child_latex(node, "sub")
        upper = _math_child_latex(node, "sup")
        expression = _math_child_latex(node, "e")
        limits = ""
        if lower:
            limits += f"_{{{lower}}}"
        if upper:
            limits += f"^{{{upper}}}"
        return f"{operator}{limits} {expression}".strip()

    if name == "bar":
        expression = _math_child_latex(node, "e")
        return f"\\overline{{{expression}}}" if expression else ""

    return "".join(_omml_to_latex(child) for child in node)


def _math_child_latex(node: ElementTree.Element, child_name: str) -> str:
    for child in node:
        if local_name(child.tag) == child_name:
            return _clean_latex(_omml_to_latex(child))
    return ""


def _latex_text(text: str) -> str:
    replacements = {
        "\u2212": "-",
        "\u2013": "-",
        "\u2014": "-",
        "\u00d7": r" \cdot ",
        "\u2219": r" \cdot ",
        "\u22c5": r" \cdot ",
        "\u00b7": r" \cdot ",
        "*": r" \cdot ",
    }

    for source, target in replacements.items():
        text = text.replace(source, target)

    return text


def _clean_latex(text: str) -> str:
    text = text.replace("\u00a0", " ")
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s*\\cdot\s*", r" \\cdot ", text)
    text = re.sub(r"\s+([,.;:=+\-*/^)])", r"\1", text)
    text = re.sub(r"([({])\s+", r"\1", text)
    return text.strip()


def _group_if_needed(value: str) -> str:
    value = value.strip()
    if len(value) == 1:
        return value
    if value.startswith("{") and value.endswith("}"):
        return value
    return f"{{{value}}}"
