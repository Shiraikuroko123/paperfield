FROM node:22-slim AS flowloom-build

WORKDIR /build/apps/flowloom
COPY apps/flowloom/package.json apps/flowloom/package-lock.json ./
RUN npm ci
COPY apps/flowloom/ ./
RUN npm run build

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PAPERFIELD_HOST=0.0.0.0 \
    PAPERFIELD_PORT=8765 \
    PAPERFIELD_DATA_DIR=/data/paperfield \
    PAPERFIELD_ATLAS_INTERNAL_URL=http://127.0.0.1:8795 \
    RESEARCH_ATLAS_HOST=127.0.0.1 \
    RESEARCH_ATLAS_PORT=8795 \
    RESEARCH_ATLAS_DB_PATH=/data/atlas/atlas.db \
    RESEARCH_ATLAS_PAPERFIELD_URL=http://127.0.0.1:8765/ \
    RESEARCH_ATLAS_FLOWLOOM_URL=http://127.0.0.1:8765/flowloom/

WORKDIR /app

RUN useradd --create-home --uid 10001 paperfield \
    && mkdir -p /data/paperfield /data/atlas \
    && chown -R paperfield:paperfield /data /app

COPY --chown=paperfield:paperfield deploy/requirements.txt ./requirements.txt

RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=paperfield:paperfield src ./src
COPY --chown=paperfield:paperfield content/courses/课程 ./content/courses/课程
COPY --chown=paperfield:paperfield scripts/run-container.py ./scripts/run-container.py
COPY --from=flowloom-build --chown=paperfield:paperfield /build/apps/flowloom/dist ./apps/flowloom/dist

USER paperfield

EXPOSE 8765
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import json,urllib.request; [json.load(urllib.request.urlopen(url, timeout=3)) for url in ('http://127.0.0.1:8765/api/health','http://127.0.0.1:8765/atlas/api/health')]"

CMD ["python", "scripts/run-container.py"]
