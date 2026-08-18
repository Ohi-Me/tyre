# TYRE AI Gateway — Python FastAPI service
# Multi-stage build: builder + slim runtime.

FROM python:3.11-slim AS builder

WORKDIR /build
ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl && rm -rf /var/lib/apt/lists/*

COPY backend/ai/gateway/pyproject.toml ./
RUN pip install --user --upgrade pip && \
    python -c "import tomllib; d=tomllib.load(open('pyproject.toml','rb')); open('/tmp/reqs.txt','w').write(chr(10).join(d['project']['dependencies']))" && \
    pip install --user -r /tmp/reqs.txt

# ─────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl && rm -rf /var/lib/apt/lists/*

# Non-root user (uid 1001) — matches K8s runAsNonRoot: true / runAsUser: 1001.
RUN addgroup --system --gid 1001 python && \
    adduser --system --uid 1001 --ingroup python python

# Copy the builder's --user install into the non-root user's HOME so the
# PATH below resolves to the same packages without re-pip-installing.
COPY --from=builder --chown=python:python /root/.local /home/python/.local
ENV HOME=/home/python \
    PATH=/home/python/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app
COPY --chown=python:python backend/ai/gateway/app/ ./app/

# Ensure the runtime user owns everything it needs to read/write at runtime.
RUN chown -R python:python /app

USER 1001

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=20s \
  CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
