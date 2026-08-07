# =============================================================================
# AI Studio — Codegen sandbox image (Aider Sandbox)
# =============================================================================
# Template-free: project source is bind-mounted at /workspace from Gitea clone.
# Build: docker build -t aistudio/aider-sandbox:latest -f docker/aider-sandbox/Dockerfile .
# =============================================================================
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

# Pinned for reproducibility (Task 3.1 decision).
ARG AIDER_VERSION=0.60.0
RUN pip3 install --no-cache-dir --break-system-packages aider-chat==${AIDER_VERSION}

RUN useradd --create-home --shell /bin/bash sandbox \
    && mkdir -p /workspace /tmp/sandbox /run/secrets \
    && chown sandbox:sandbox /workspace /tmp/sandbox \
    && git config --system user.email "coder@aistudio.local" \
    && git config --system user.name "AI Studio Coder"

COPY runner-checks.js runner-gate.js runner.js /usr/local/bin/
RUN chmod +x /usr/local/bin/runner.js

WORKDIR /workspace

USER sandbox

# Env at start: TASK_JSON, MODEL_PROVIDER, MODEL_NAME, API_BASE_URL (optional).
# API key: read-only file at /run/secrets/api_key (NOT process.env.API_KEY).

ENTRYPOINT ["node", "/usr/local/bin/runner.js"]
