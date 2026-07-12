// Handles incoming GitHub webhook events: parses pull_request and push events,
// builds a Job struct, and enqueues it in Redis.
package handlers

import (
	"devmind/gateway/models"
	"devmind/gateway/queue"
	"encoding/json"
	"fmt"
	"net/http"
)

type githubPayload struct {
	Action     string `json:"action"`
	Number     int    `json:"number"`
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
	After  string `json:"after"`
	Ref    string `json:"ref"`
	Pusher struct {
		Name string `json:"name"`
	} `json:"pusher"`
}

func GitHubWebhook(w http.ResponseWriter, r *http.Request) {
	event := r.Header.Get("X-GitHub-Event")
	if event != "pull_request" && event != "push" {
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
		job.PRNumber = p.Number
		job.DiffURL = p.PullRequest.DiffURL
		job.SHA = p.PullRequest.Head.SHA
		job.Author = p.PullRequest.User.Login
		job.Branch = p.PullRequest.Head.Ref
	} else if event == "push" {
		job.SHA = p.After
		job.Author = p.Pusher.Name
		job.Branch = p.Ref
	}

	if err := queue.Push(r.Context(), job); err != nil {
		http.Error(w, "queue error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	fmt.Fprintln(w, "ok")
}
