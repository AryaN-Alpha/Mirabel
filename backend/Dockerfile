FROM python:3.13-slim

# Unbuffered stdout/stderr so `docker compose logs` / `docker logs` show
# output in real time instead of only on buffer flush or process exit.
ENV PYTHONUNBUFFERED=1

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

# collectstatic only needs non-empty values for settings.py's required env
# vars, never the real ones; the real values are injected at runtime via
# env_file/.env, not baked into the image.
ARG DJANGO_SECRET_KEY=build-time-placeholder-not-for-runtime
ARG CREDENTIAL_ENCRYPTION_KEY=build-time-placeholder-not-for-runtime
ARG DB_PASSWORD=build-time-placeholder-not-for-runtime
ENV DJANGO_SECRET_KEY=$DJANGO_SECRET_KEY
ENV CREDENTIAL_ENCRYPTION_KEY=$CREDENTIAL_ENCRYPTION_KEY
ENV DB_PASSWORD=$DB_PASSWORD
RUN python manage.py collectstatic --noinput

EXPOSE 8000
