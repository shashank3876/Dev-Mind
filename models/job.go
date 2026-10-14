// Job is the PR-review payload pushed to Redis (local) or Pub/Sub (production).
package models

import (
	"fmt"
	"strings"

	"github.com/google/uuid"
)

const DefaultMaxAttempts = 5

type Job struct {
	ID             string `json:"id"`
	DeliveryID     string `json:"delivery_id,omitempty"`
	IdempotencyKey string `json:"idempotency_key"`
	Repo           string `json:"repo"`
	PRNumber       int    `json:"pr_number"`
	DiffURL        string `json:"diff_url"`
	SHA            string `json:"sha"`
	Author         string `json:"author"`
	Branch         string `json:"branch"`
	EventType      string `json:"event_type"`
	Attempt        int    `json:"attempt"`
	MaxAttempts    int    `json:"max_attempts"`
	Status         string `json:"status,omitempty"`
}

func NewJobID() string {
	return uuid.NewString()
}

func IdempotencyKey(repo string, prNumber int, sha string) string {
	return fmt.Sprintf("%s#%d@%s", strings.TrimSpace(repo), prNumber, strings.TrimSpace(sha))
}

func (j *Job) Normalize() {
	if j.ID == "" {
		j.ID = NewJobID()
	}
	if j.MaxAttempts <= 0 {
		j.MaxAttempts = DefaultMaxAttempts
	}
	if j.IdempotencyKey == "" && j.Repo != "" && j.PRNumber > 0 && j.SHA != "" {
		j.IdempotencyKey = IdempotencyKey(j.Repo, j.PRNumber, j.SHA)
	}
	if j.Status == "" {
		j.Status = "queued"
	}
}
