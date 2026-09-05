// Handles incoming GitHub pull_request webhooks, builds a Job, and enqueues it
// (Redis locally, Pub/Sub in production). Only opened/reopened/synchronize run a review.
package handlers

import (
	"devmind/gateway/models"
	"devmind/gateway/queue"
	"encoding/json"
	"net/http"
	"strings"
)

type githubPayload struct {
	Action      string `json:"action"`
	Number      int    `json:"number"`
	PullRequest *struct {
		DiffURL string `json:"diff_url"`
		Head    struct {
			SHA   string `json:"sha"`
			Ref   string `json:"ref"`
			Label string `json:"label"`
		} `json:"head"`
		User struct {
			Login string `json:"login"`
		} `json:"user"`
	} `json:"pull_request"`
	Repository struct {
		FullName string `json:"full_name"`
	} `json:"repository"`
}

func isReviewAction(action string) bool {
	switch action {
	case "opened", "reopened", "synchronize":
		return true
	default:
		return false
	}
}

func writeJSON(w http.ResponseWriter, status int, body map[string]any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func BuildReviewJob(event, deliveryID, action string, p githubPayload) (models.Job, bool) {
	if event != "pull_request" || p.PullRequest == nil || !isReviewAction(action) {
		return models.Job{}, false
	}
	if p.Number == 0 || p.PullRequest.DiffURL == "" {
		return models.Job{}, false
	}

	job := models.Job{
		ID:          models.NewJobID(),
		DeliveryID:  strings.TrimSpace(deliveryID),
		Repo:        p.Repository.FullName,
		PRNumber:    p.Number,
		DiffURL:     p.PullRequest.DiffURL,
		SHA:         p.PullRequest.Head.SHA,
		Author:      p.PullRequest.User.Login,
		Branch:      p.PullRequest.Head.Ref,
		EventType:   event,
		Attempt:     0,
		MaxAttempts: models.DefaultMaxAttempts,
		Status:      "queued",
	}
	job.Normalize()
	return job, true
}

func GitHubWebhook(w http.ResponseWriter, r *http.Request) {
	event := r.Header.Get("X-GitHub-Event")
	if event != "pull_request" {
		writeJSON(w, http.StatusOK, map[string]any{"status": "ignored", "reason": "event"})
		return
	}

	var p githubPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	job, ok := BuildReviewJob(event, r.Header.Get("X-GitHub-Delivery"), p.Action, p)
	if !ok {
		writeJSON(w, http.StatusOK, map[string]any{"status": "ignored", "reason": "action"})
		return
	}

	accepted, err := queue.ReserveDedup(r.Context(), job)
	if err != nil {
		http.Error(w, "queue error", http.StatusInternalServerError)
		return
	}
	if !accepted {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":          "duplicate",
			"job_id":          job.ID,
			"delivery_id":     job.DeliveryID,
			"idempotency_key": job.IdempotencyKey,
		})
		return
	}

	if err := queue.Push(r.Context(), job); err != nil {
		http.Error(w, "queue error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":          "ok",
		"job_id":          job.ID,
		"delivery_id":     job.DeliveryID,
		"idempotency_key": job.IdempotencyKey,
	})
}
