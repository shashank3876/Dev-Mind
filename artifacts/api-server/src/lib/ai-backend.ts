export function getAiBackendUrl(): string {
  const url =
    process.env.AI_BACKEND_URL ?? process.env.VITE_API_URL ?? "http://localhost:8001";
  return url.replace(/\/+$/, "");
}

/** Headers for service-to-service calls to ai-backend. */
export function aiBackendHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(extra ?? {}),
  };
  const secret = process.env.AI_BACKEND_SECRET?.trim();
  if (secret) {
    headers["X-DevMind-Secret"] = secret;
  }
  return headers;
}
