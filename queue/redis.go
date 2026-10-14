// Redis client: pending list, dedup keys, and optional job-status hashes.
package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"devmind/gateway/models"

	"github.com/redis/go-redis/v9"
)

const (
	JobsKey        = "webhook_jobs"
	ProcessingKey  = "webhook_jobs_processing"
	DelayedKey     = "webhook_jobs_delayed"
	DeadLetterKey  = "webhook_jobs_dlq"
	deliveryPrefix = "webhook:delivery:"
	idemPrefix     = "webhook:idem:"
	jobPrefix      = "job:"
	DedupTTL       = 7 * 24 * time.Hour
)

var client *redis.Client

func redisAddr() string {
	addr := strings.TrimSpace(os.Getenv("REDIS_URL"))
	if addr == "" {
		return "localhost:6379"
	}
	addr = strings.TrimPrefix(addr, "redis://")
	addr = strings.TrimPrefix(addr, "rediss://")
	return addr
}

func initRedis() {
	client = redis.NewClient(&redis.Options{
		Addr: redisAddr(),
	})
}

func redisReady() bool {
	return client != nil
}

func pushRedis(ctx context.Context, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if err := client.LPush(ctx, JobsKey, string(data)).Err(); err != nil {
		return err
	}
	if job, ok := payload.(models.Job); ok {
		_ = writeJobHash(ctx, job)
	}
	return nil
}

func reserveDedupRedis(ctx context.Context, job models.Job) (bool, error) {
	if client == nil {
		return true, nil
	}
	if job.DeliveryID != "" {
		ok, err := client.SetNX(ctx, deliveryPrefix+job.DeliveryID, job.ID, DedupTTL).Result()
		if err != nil {
			return false, err
		}
		if !ok {
			return false, nil
		}
	}
	if job.IdempotencyKey != "" {
		ok, err := client.SetNX(ctx, idemPrefix+job.IdempotencyKey, job.ID, DedupTTL).Result()
		if err != nil {
			return false, err
		}
		if !ok {
			return false, nil
		}
	}
	return true, nil
}

func writeJobHash(ctx context.Context, job models.Job) error {
	if client == nil || job.ID == "" {
		return nil
	}
	return client.HSet(ctx, jobPrefix+job.ID, map[string]any{
		"id":              job.ID,
		"delivery_id":     job.DeliveryID,
		"idempotency_key": job.IdempotencyKey,
		"repo":            job.Repo,
		"pr_number":       fmt.Sprintf("%d", job.PRNumber),
		"sha":             job.SHA,
		"status":          job.Status,
		"attempt":         fmt.Sprintf("%d", job.Attempt),
		"max_attempts":    fmt.Sprintf("%d", job.MaxAttempts),
	}).Err()
}
