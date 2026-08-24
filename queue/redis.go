// Redis client wrapper that pushes jobs to the "webhook_jobs" list.
package queue

import (
	"context"
	"encoding/json"
	"os"
	"strings"

	"github.com/redis/go-redis/v9"
)

const JobsKey = "webhook_jobs"

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

func pushRedis(ctx context.Context, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return client.LPush(ctx, JobsKey, string(data)).Err()
}
