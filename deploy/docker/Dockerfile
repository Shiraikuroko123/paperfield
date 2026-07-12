FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PAPERFIELD_HOST=0.0.0.0 \
    PAPERFIELD_PORT=8765 \
    PAPERFIELD_DATA_DIR=/data

WORKDIR /app

RUN useradd --create-home --uid 10001 paperfield \
    && mkdir -p /data \
    && chown -R paperfield:paperfield /data /app

COPY --chown=paperfield:paperfield deploy/requirements.txt ./requirements.txt

RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=paperfield:paperfield src ./src

USER paperfield

EXPOSE 8765
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import json,urllib.request; json.load(urllib.request.urlopen('http://127.0.0.1:8765/api/health', timeout=3))"

CMD ["python", "src/paperfield/app.py"]
