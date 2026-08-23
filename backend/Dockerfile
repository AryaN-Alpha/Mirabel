FROM python:3.13-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# psycopg[binary] ships a precompiled wheel, no libpq/build tooling needed.
# chromadb (full package, not chromadb-client) is still required even though
# the vector index runs server-side in the chroma container: query/upsert
# embedding happens client-side via onnxruntime, which chromadb-client omits.
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# settings.py's RotatingFileHandler needs this directory to already exist.
RUN mkdir -p logs

# collectstatic only needs a non-empty SECRET_KEY, never the real one; the
# real key is injected at runtime via env_file/.env, not baked into the image.
ARG DJANGO_SECRET_KEY=build-time-placeholder-not-for-runtime
ENV DJANGO_SECRET_KEY=$DJANGO_SECRET_KEY
RUN python manage.py collectstatic --noinput

EXPOSE 8000
