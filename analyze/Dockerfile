FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-rus \
    libmagic1

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM alpine:latest

# Устанавливаем пакет ca-certificates
RUN apk --no-cache add ca-certificates

# Копируем сертификаты Минцифры
COPY russian_trusted_root_ca.crt /usr/local/share/ca-certificates/russian_trusted_root_ca.crt
COPY russian_trusted_sub_ca.crt /usr/local/share/ca-certificates/russian_trusted_sub_ca.crt

# Обновляем хранилище
RUN update-ca-certificates
