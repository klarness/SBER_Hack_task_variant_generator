from pydantic import BaseModel, Field


class ParseResponse(BaseModel):
    raw_text: str
    normalized_text: str


class AnalyzeItem(BaseModel):
    order: int
    context: str = ""
    content: str


class AnalyzeResponse(BaseModel):
    original_text: str
    items: list[AnalyzeItem]
    subject: str = ""
    topic: str = ""
    task_type: str = ""
    difficulty: str = ""


class GenerateRequest(BaseModel):
    user_id: str
    task_id: str
    task_item_id: str
    subject: str = ""
    variant_number: int = 1
    order: int = 1
    context: str = ""
    source_content: str
    settings: dict | None = None
    previous_variants: list[str] = Field(default_factory=list)
    custom_prompt: str = ""


class GenerateResponse(BaseModel):
    content: str


class ValidateRequest(BaseModel):
    user_id: str
    task_id: str
    task_item_id: str
    subject: str = ""
    variant_number: int = 1
    original: str
    generated: str
    settings: dict | None = None
    previous_variants: list[str] = Field(default_factory=list)


class ValidateResponse(BaseModel):
    valid: bool
