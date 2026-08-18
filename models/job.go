// Job defines the structure pushed to the PR-review queue for each GitHub webhook event.
package models

type Job struct {
	Repo      string `json:"repo"`
	PRNumber  int    `json:"pr_number"`
	DiffURL   string `json:"diff_url"`
	SHA       string `json:"sha"`
	Author    string `json:"author"`
	Branch    string `json:"branch"`
	EventType string `json:"event_type"`
}
