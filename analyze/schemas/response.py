from pydantic import BaseModel


class ParseResponse(BaseModel):
    raw_text: str
    normalized_text: str