# RabbitMQ consumer helpers using aio-pika.
from __future__ import annotations

import os

import aio_pika

RABBIT_JOB_QUEUE = "devmind.pr_jobs"
RABBIT_DLX = "devmind.dlx"
RABBIT_DL_QUEUE = "devmind.pr_jobs.dlq"


def rabbit_url() -> str:
    return os.environ.get("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")


async def connect_rabbitmq() -> aio_pika.RobustConnection:
    return await aio_pika.connect_robust(rabbit_url())


async def declare_topology(channel: aio_pika.abc.AbstractChannel) -> aio_pika.abc.AbstractQueue:
    """Declare DLX, DLQ, and main job queue — idempotent, mirrors the Go producer."""
    dlx = await channel.declare_exchange(RABBIT_DLX, aio_pika.ExchangeType.DIRECT, durable=True)

    dlq = await channel.declare_queue(RABBIT_DL_QUEUE, durable=True)
    await dlq.bind(dlx, routing_key=RABBIT_DL_QUEUE)

    queue = await channel.declare_queue(
        RABBIT_JOB_QUEUE,
        durable=True,
        arguments={
            "x-dead-letter-exchange": RABBIT_DLX,
            "x-dead-letter-routing-key": RABBIT_DL_QUEUE,
        },
    )
    return queue
