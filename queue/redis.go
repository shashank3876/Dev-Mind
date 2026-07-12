// Redis client wrapper that pushes jobs to the "webhook_jobs" list.
package queue

import (
	"context"
	"encoding/json"
	"os"

	"github.com/redis/go-redis/v9"
)

const JobsKey = "webhook_jobs"

var client *redis.Client

func Init() {
	client = redis.NewClient(&redis.Options{
		Addr: os.Getenv("REDIS_URL"),
	})
}

func Push(ctx context.Context, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return client.LPush(ctx, JobsKey, string(data)).Err()
}
