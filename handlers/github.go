// Handles incoming GitHub pull_request webhooks, builds a Job, and enqueues it
// (Redis locally, Pub/Sub in production). Only opened/reopened/synchronize run a review.
package handlers

import (
	"devmind/gateway/models"
	"devmind/gateway/queue"
	"encoding/json"
	"fmt"
	"net/http"
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

func GitHubWebhook(w http.ResponseWriter, r *http.Request) {
	event := r.Header.Get("X-GitHub-Event")
	if event != "pull_request" {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "ignored")
		return
	}

	var p githubPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	job := models.Job{
		Repo:      p.Repository.FullName,
		EventType: event,
	}

	if event == "pull_request" && p.PullRequest != nil {
		switch p.Action {
		case "opened", "reopened", "synchronize":
		default:
			w.WriteHeader(http.StatusOK)
			fmt.Fprintln(w, "ignored")
			return
		}
		job.PRNumber = p.Number
		job.DiffURL = p.PullRequest.DiffURL
		job.SHA = p.PullRequest.Head.SHA
		job.Author = p.PullRequest.User.Login
		job.Branch = p.PullRequest.Head.Ref
	}

	if job.PRNumber == 0 || job.DiffURL == "" {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "ignored")
		return
	}

	if err := queue.Push(r.Context(), job); err != nil {
		http.Error(w, "queue error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	fmt.Fprintln(w, "ok")
}
