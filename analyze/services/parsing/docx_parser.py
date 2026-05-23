import asyncio
import io
import re
import zipfile
from xml.etree import ElementTree

import docx

from analyze.services.llm.client import GigaChatClient
from analyze.services.parsing.office_math import format_inline_math, omml_to_latex
from analyze.services.parsing.tesseract_ocr import TesseractOCR


WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math"

NS = {
    "w": WORD_NS,
    "m": MATH_NS,
}

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


def _namespace(tag: str) -> str:
    if tag.startswith("{"):
        return tag[1:].split("}", 1)[0]

    return ""


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _attribute_value(node: ElementTree.Element, attribute_name: str) -> str:
    for name, value in node.attrib.items():
        if _local_name(name) == attribute_name:
            return value

    return ""


def _clean_text(text: str) -> str:
    text = text.replace("\u00a0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)

    return text.strip()


def _clean_math_text(text: str) -> str:
    replacements = {
        "\u2212": "-",
        "\u00d7": "*",
        "\u2219": "*",
        "\u22c5": "*",
        "\u00b7": "*",
    }

    for source, target in replacements.items():
        text = text.replace(source, target)

    return re.sub(r"\s+", " ", text).strip()


class DOCXParser:
    def __init__(self):
        self.gigachat = GigaChatClient()
        self.tesseract = TesseractOCR()
        self.semaphore = asyncio.Semaphore(3)

    async def parse(self, file_bytes: bytes) -> str:
        file_stream = io.BytesIO(file_bytes)

        document = docx.Document(file_stream)

        full_text = self._extract_document_text(file_bytes, document)

        image_tasks = []

        for rel in document.part.rels.values():
            if "image" in rel.target_ref:
                image_bytes = rel.target_part.blob

                image_tasks.append(
                    self._extract_image_text_safe(image_bytes)
                )

        if image_tasks:
            image_results = await asyncio.gather(*image_tasks)

            for text in image_results:
                if text:
                    full_text.append(text)

        return "\n".join(full_text)

    def _extract_document_text(self, file_bytes: bytes, document: docx.Document) -> list[str]:
        try:
            return self._extract_document_xml_text(file_bytes)
        except Exception as error:
            print(f"DOCX XML text extraction error: {error}")

            return [
                text
                for text in (paragraph.text.strip() for paragraph in document.paragraphs)
                if text
            ]

    def _extract_document_xml_text(self, file_bytes: bytes) -> list[str]:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
            document_xml = archive.read("word/document.xml")

        root = ElementTree.fromstring(document_xml)
        body = root.find("w:body", NS)

        if body is None:
            return []

        parts = []

        for child in body:
            local_name = _local_name(child.tag)

            if local_name == "p":
                text = self._extract_paragraph_text(child)

                if text:
                    parts.append(text)

            if local_name == "tbl":
                parts.extend(self._extract_table_text(child))

        return parts

    def _extract_table_text(self, table: ElementTree.Element) -> list[str]:
        rows = []

        for row in table.findall(".//w:tr", NS):
            cells = []

            for cell in row.findall("./w:tc", NS):
                paragraphs = []

                for paragraph in cell.findall(".//w:p", NS):
                    text = self._extract_paragraph_text(paragraph)

                    if text:
                        paragraphs.append(text)

                if paragraphs:
                    cells.append(" ".join(paragraphs))

            if cells:
                rows.append(" | ".join(cells))

        return rows

    def _extract_paragraph_text(self, paragraph: ElementTree.Element) -> str:
        chunks = []
        self._walk_paragraph_node(paragraph, chunks)

        return _clean_text("".join(chunks))

    def _walk_paragraph_node(self, node: ElementTree.Element, chunks: list[str]) -> None:
        namespace = _namespace(node.tag)
        local_name = _local_name(node.tag)

        if namespace == MATH_NS and local_name in {"oMath", "oMathPara"}:
            math_text = omml_to_latex(node)

            if math_text:
                chunks.append(format_inline_math(math_text))

            return

        if namespace == WORD_NS and local_name == "t":
            chunks.append(node.text or "")
            return

        if namespace == WORD_NS and local_name == "tab":
            chunks.append("\t")
            return

        if namespace == WORD_NS and local_name in {"br", "cr"}:
            chunks.append("\n")
            return

        for child in node:
            self._walk_paragraph_node(child, chunks)

    def _omml_to_text(self, node: ElementTree.Element) -> str:
        local_name = _local_name(node.tag)

        if local_name == "t":
            return node.text or ""

        if local_name in MATH_PROPERTY_NODES or local_name.endswith("Pr"):
            return ""

        if local_name == "f":
            numerator = self._math_child_text(node, "num")
            denominator = self._math_child_text(node, "den")

            if numerator and denominator:
                return f"({numerator})/({denominator})"

        if local_name in {"sSup", "sup"}:
            base = self._math_child_text(node, "e")
            superscript = self._math_child_text(node, "sup")

            if base and superscript:
                return f"{base}^{superscript}"

        if local_name in {"sSub", "sub"}:
            base = self._math_child_text(node, "e")
            subscript = self._math_child_text(node, "sub")

            if base and subscript:
                return f"{base}_{subscript}"

        if local_name == "sSubSup":
            base = self._math_child_text(node, "e")
            subscript = self._math_child_text(node, "sub")
            superscript = self._math_child_text(node, "sup")

            if base and subscript and superscript:
                return f"{base}_{subscript}^{superscript}"

        if local_name == "rad":
            degree = self._math_child_text(node, "deg")
            expression = self._math_child_text(node, "e")

            if expression:
                return f"root({degree}, {expression})" if degree else f"sqrt({expression})"

        if local_name == "d":
            expression = self._math_child_text(node, "e")
            start = "("
            end = ")"

            for child in node:
                if _local_name(child.tag) != "dPr":
                    continue

                for property_node in child:
                    property_name = _local_name(property_node.tag)

                    if property_name == "begChr":
                        start = _attribute_value(property_node, "val") or start

                    if property_name == "endChr":
                        end = _attribute_value(property_node, "val") or end

            return f"{start}{expression}{end}" if expression else ""

        if local_name == "nary":
            operator = self._math_child_text(node, "chr")
            lower = self._math_child_text(node, "sub")
            upper = self._math_child_text(node, "sup")
            expression = self._math_child_text(node, "e")
            limits = ""

            if lower or upper:
                limits = f"_{lower}^{upper}"

            return f"{operator}{limits} {expression}".strip()

        return "".join(self._omml_to_text(child) for child in node)

    def _math_child_text(self, node: ElementTree.Element, child_name: str) -> str:
        for child in node:
            if _local_name(child.tag) == child_name:
                return _clean_math_text(self._omml_to_text(child))

        return ""

    async def _extract_image_text_safe(self, image_bytes: bytes) -> str:
        async with self.semaphore:
            try:
                local_result = self.tesseract.extract_text(image_bytes)
                if local_result.accepted:
                    return local_result.text

                return await self.gigachat.extract_text_from_image(image_bytes)
            except Exception as e:
                print(f"DOCX image extraction error: {e}")
                return ""
