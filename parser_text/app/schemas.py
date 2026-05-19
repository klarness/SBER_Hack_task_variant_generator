from pydantic import BaseModel

class ParsedTextResponse(BaseModel):
    filename: str
    file_type: str
    text: str