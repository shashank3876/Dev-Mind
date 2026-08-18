// Queue backend dispatcher. QUEUE_BACKEND=redis (local) or pubsub (production).
package queue

import (
	"context"
	"log"
	"os"
	"strings"
)

const (
	BackendRedis  = "redis"
	BackendPubSub = "pubsub"
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
	case BackendRedis:
		initRedis()
	default:
		log.Fatalf("unsupported QUEUE_BACKEND %q (use %q or %q)", backend, BackendRedis, BackendPubSub)
	}
}

func Push(ctx context.Context, payload any) error {
	if backend == BackendPubSub {
		return publishPubSub(ctx, payload)
	}
	return pushRedis(ctx, payload)
}
