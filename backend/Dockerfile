FROM python:3.13-slim

WORKDIR /app

# Build deps for mysqlclient on Linux (no PyMySQL shim needed in containers).
RUN apt-get update && apt-get install -y --no-install-recommends \
    default-libmysqlclient-dev pkg-config gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# Install mysqlclient properly in the container; chromadb-client replaces
# chromadb to avoid building hnswlib (the server runs in the chroma container).
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN python manage.py collectstatic --noinput

EXPOSE 8000
