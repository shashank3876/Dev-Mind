package models

import "testing"

func TestIdempotencyKey(t *testing.T) {
	got := IdempotencyKey(" acme/app ", 9, " sha ")
	if got != "acme/app#9@sha" {
		t.Fatalf("got %q", got)
	}
}

func TestJobNormalizeFillsDefaults(t *testing.T) {
	job := Job{Repo: "a/b", PRNumber: 1, SHA: "s"}
	job.Normalize()
	if job.ID == "" {
		t.Fatal("expected id")
	}
	if job.MaxAttempts != DefaultMaxAttempts {
		t.Fatalf("max attempts %d", job.MaxAttempts)
	}
	if job.IdempotencyKey != "a/b#1@s" {
		t.Fatalf("key %q", job.IdempotencyKey)
	}
	if job.Status != "queued" {
		t.Fatalf("status %q", job.Status)
	}
}
