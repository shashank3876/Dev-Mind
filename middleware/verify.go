// Middleware that verifies the HMAC-SHA256 signature on incoming GitHub webhooks.
package middleware

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

func VerifyGitHubSignature(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		secret := os.Getenv("GITHUB_WEBHOOK_SECRET")
		sig := r.Header.Get("X-Hub-Signature-256")
		if sig == "" {
			http.Error(w, "missing signature", http.StatusUnauthorized)
			return
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "cannot read body", http.StatusBadRequest)
			return
		}
		defer r.Body.Close()
		r.Body = io.NopCloser(strings.NewReader(string(body)))

		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write(body)
		expected := fmt.Sprintf("sha256=%s", hex.EncodeToString(mac.Sum(nil)))

		if !hmac.Equal([]byte(sig), []byte(expected)) {
			http.Error(w, "invalid signature", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}
