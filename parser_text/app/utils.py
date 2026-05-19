from pathlib import Path

def detect_file_type(filename: str) -> str:
    ext = Path(filename).suffix.lower()

    if ext == ".pdf":
        return "pdf"
    elif ext == ".docx":
        return "docx"
    elif ext in [".png", ".jpg", ".jpeg"]:
        return "image"

    return "unknown"