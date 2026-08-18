FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8080
ENV QUEUE_BACKEND=pubsub

COPY requirements-worker.txt .
RUN pip install --no-cache-dir -r requirements-worker.txt

COPY . .

EXPOSE 8080

CMD ["sh", "-c", "uvicorn worker:app --host 0.0.0.0 --port ${PORT}"]
