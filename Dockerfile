FROM python:3.12.6-slim-bookworm AS base
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_PROJECT_ENVIRONMENT=/venv
ENV PATH="/venv/bin:$PATH"
ENV UV_LINK_MODE=copy

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

# dev: deps only — bind mount provides code, nginx, frontend
FROM base AS dev

# prod: bake everything
FROM base AS prod
COPY . /app
RUN apt-get update && apt-get install -y --no-install-recommends nginx \
 && rm -rf /var/lib/apt/lists/*
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY frontend/northpoint /usr/share/nginx/html/
