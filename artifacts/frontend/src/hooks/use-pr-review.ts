import { useState, useCallback } from "react";
import { readSseStream, parseReviewMeta } from "@/lib/sse";

export function usePrReview() {
  const [review, setReview] = useState("");
  const [meta, setMeta] = useState<{ repo: string; prNumber: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const reviewPr = useCallback(async (prUrl: string) => {
    setReview("");
    setMeta(null);
    setError(null);
    setIsLoading(true);
    setIsStreaming(true);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || "";
      const response = await fetch(`${apiUrl}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pr_url: prUrl.trim() }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || `Request failed (${response.status})`);
      }

      if (!response.body) throw new Error("No response body");

      let content = "";
      for await (const token of readSseStream(response.body)) {
        if (token === "[DONE]") continue;

        const parsedMeta = parseReviewMeta(token);
        if (parsedMeta) {
          setMeta(parsedMeta);
          continue;
        }

        content += token;
        setReview(content);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Review failed";
      setError(message);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  }, []);

  return { review, meta, error, isLoading, isStreaming, reviewPr };
}
