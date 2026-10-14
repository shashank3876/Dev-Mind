package handlers

import (
	"testing"
)

func samplePayload() githubPayload {
	p := githubPayload{
		Action: "opened",
		Number: 42,
	}
	p.Repository.FullName = "acme/devmind"
	p.PullRequest = &struct {
		DiffURL string `json:"diff_url"`
		Head    struct {
			SHA   string `json:"sha"`
			Ref   string `json:"ref"`
			Label string `json:"label"`
		} `json:"head"`
		User struct {
			Login string `json:"login"`
		} `json:"user"`
	}{
		DiffURL: "https://github.com/acme/devmind/pull/42.diff",
	}
	p.PullRequest.Head.SHA = "abc123"
	p.PullRequest.Head.Ref = "feat/x"
	p.PullRequest.User.Login = "octocat"
	return p
}

func TestBuildReviewJob_AssignsIds(t *testing.T) {
	job, ok := BuildReviewJob("pull_request", "delivery-1", "opened", samplePayload())
	if !ok {
		t.Fatal("expected review job")
	}
	if job.ID == "" {
		t.Fatal("expected job id")
	}
	if job.DeliveryID != "delivery-1" {
		t.Fatalf("delivery: %q", job.DeliveryID)
	}
	if job.IdempotencyKey != "acme/devmind#42@abc123" {
		t.Fatalf("idempotency: %q", job.IdempotencyKey)
	}
	if job.MaxAttempts != 5 {
		t.Fatalf("max attempts: %d", job.MaxAttempts)
	}
}

func TestBuildReviewJob_IgnoresClosed(t *testing.T) {
	_, ok := BuildReviewJob("pull_request", "d", "closed", samplePayload())
	if ok {
		t.Fatal("closed PRs should be ignored")
	}
}

func TestBuildReviewJob_IgnoresNonPR(t *testing.T) {
	_, ok := BuildReviewJob("ping", "d", "opened", samplePayload())
	if ok {
		t.Fatal("non-PR events should be ignored")
	}
}
