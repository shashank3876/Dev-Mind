// Entry point for the DevMind gateway: sets up chi router, loads env, starts server.
package main

import (
	"devmind/gateway/handlers"
	"devmind/gateway/middleware"
	"devmind/gateway/queue"
	"fmt"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	queue.Init()

	r := chi.NewRouter()
	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintln(w, `{"status":"ok"}`)
	})

	r.With(middleware.VerifyGitHubSignature).Post("/webhook/github", handlers.GitHubWebhook)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("Gateway listening on :%s\n", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		fmt.Fprintf(os.Stderr, "server error: %v\n", err)
		os.Exit(1)
	}
}
