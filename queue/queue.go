// Queue backend dispatcher. QUEUE_BACKEND=redis (local) or pubsub (production).
package queue

import (
	"context"
	"log"
	"os"
	"strings"

	"devmind/gateway/models"
)

const (
	BackendRedis    = "redis"
	BackendPubSub   = "pubsub"
	BackendRabbitMQ = "rabbitmq"
)

var backend string

func Init() {
	backend = strings.ToLower(strings.TrimSpace(os.Getenv("QUEUE_BACKEND")))
	if backend == "" {
		backend = BackendRedis
	}

	switch backend {
	case BackendPubSub:
		initPubSub()
		// Optional Redis for webhook dedup when REDIS_URL is set in production.
		if strings.TrimSpace(os.Getenv("REDIS_URL")) != "" {
			initRedis()
		}
	case BackendRedis:
		initRedis()
	case BackendRabbitMQ:
		initRabbitMQ()
		// Optional Redis for dedup when REDIS_URL is set.
		if strings.TrimSpace(os.Getenv("REDIS_URL")) != "" {
			initRedis()
		}
	default:
		log.Fatalf("unsupported QUEUE_BACKEND %q (use %q, %q, or %q)", backend, BackendRedis, BackendPubSub, BackendRabbitMQ)
	}
}

func Push(ctx context.Context, payload any) error {
	switch backend {
	case BackendPubSub:
		return publishPubSub(ctx, payload)
	case BackendRabbitMQ:
		return publishRabbitMQ(ctx, payload)
	default:
		return pushRedis(ctx, payload)
	}
}

// ReserveDedup returns false when this delivery or repo#pr@sha was already accepted.
// If Redis is unavailable, it returns true so the worker can still dedup.
func ReserveDedup(ctx context.Context, job models.Job) (bool, error) {
	if !redisReady() {
		return true, nil
	}
	return reserveDedupRedis(ctx, job)
}
