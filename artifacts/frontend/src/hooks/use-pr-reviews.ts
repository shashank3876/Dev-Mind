import { useCallback, useEffect, useState } from "react";
import { readSseStream, parseReviewMeta } from "@/lib/sse";
import { useAuth } from "@/hooks/use-auth";

export interface ReviewMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export interface PrReviewSummary {
  id: string;
  prUrl: string;
  repo: string;
  prNumber: number;
  title: string;
  review: string;
  createdAt: string;
  updatedAt: string;
}

function apiErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const record = data as { message?: unknown; detail?: unknown };
    if (typeof record.message === "string") return record.message;
    if (typeof record.detail === "string") return record.detail;
  }
  return fallback;
}

export function usePrReviews() {
  const { isAuthenticated } = useAuth();
  const [reviews, setReviews] = useState<PrReviewSummary[]>([]);
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [review, setReview] = useState("");
  const [prUrl, setPrUrl] = useState("");
  const [meta, setMeta] = useState<{ repo: string; prNumber: number } | null>(null);
  const [messages, setMessages] = useState<ReviewMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const refreshReviews = useCallback(async () => {
    if (!isAuthenticated) {
      setReviews([]);
      return;
    }
    const response = await fetch("/api/pr-reviews", { credentials: "include" });
    if (!response.ok) return;
    const data = (await response.json()) as { reviews?: PrReviewSummary[] };
    setReviews(data.reviews ?? []);
  }, [isAuthenticated]);

  useEffect(() => {
    void refreshReviews();
  }, [refreshReviews]);

  const startNewReview = useCallback(() => {
    setActiveReviewId(null);
    setReview("");
    setPrUrl("");
    setMeta(null);
    setMessages([]);
    setError(null);
  }, []);

  const loadReview = useCallback(async (id: string) => {
    setIsHistoryLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/pr-reviews/${id}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load PR review");
      const data = (await response.json()) as {
        review: PrReviewSummary;
        messages: Array<{ id: string; role: "user" | "assistant"; content: string }>;
      };
      setActiveReviewId(data.review.id);
      setReview(data.review.review);
      setPrUrl(data.review.prUrl);
      setMeta({ repo: data.review.repo, prNumber: data.review.prNumber });
      setMessages(
        data.messages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load PR review");
    } finally {
      setIsHistoryLoading(false);
    }
  }, []);

  const deleteReview = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/pr-reviews/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) return;
      if (activeReviewId === id) {
        startNewReview();
      }
      await refreshReviews();
    },
    [activeReviewId, refreshReviews, startNewReview],
  );

  const reviewPr = useCallback(
    async (url: string) => {
      const trimmed = url.trim();
      setReview("");
      setMeta(null);
      setMessages([]);
      setError(null);
      setIsLoading(true);
      setIsStreaming(true);

      try {
        const response = isAuthenticated
          ? await fetch("/api/pr-reviews", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prUrl: trimmed }),
            })
          : await fetch(`${import.meta.env.VITE_API_URL || ""}/review`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pr_url: trimmed }),
            });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(apiErrorMessage(data, `Request failed (${response.status})`));
        }
        if (!response.body) throw new Error("No response body");

        const savedId = response.headers.get("X-Pr-Review-Id");
        if (savedId) {
          setActiveReviewId(savedId);
        } else {
          setActiveReviewId(null);
        }

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

        if (isAuthenticated) {
          await refreshReviews();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Review failed");
      } finally {
        setIsLoading(false);
        setIsStreaming(false);
      }
    },
    [isAuthenticated, refreshReviews],
  );

  const askAboutReview = useCallback(
    async (question: string) => {
      if (!activeReviewId) {
        throw new Error("Run a PR review first.");
      }
      const userMsg: ReviewMessage = {
        id: Date.now().toString(),
        role: "user",
        content: question,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsAsking(true);

      const assistantMsgId = (Date.now() + 1).toString();
      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: "assistant", content: "", isStreaming: true },
      ]);

      try {
        const response = await fetch(`/api/pr-reviews/${activeReviewId}/ask`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: question }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(apiErrorMessage(data, `Request failed (${response.status})`));
        }
        if (!response.body) throw new Error("No response body");

        let content = "";
        for await (const token of readSseStream(response.body)) {
          if (token === "[DONE]" || token.startsWith("[META:") || token.startsWith("[CONTEXT:")) {
            continue;
          }
          content += token;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, content, isStreaming: true } : msg,
            ),
          );
        }
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId ? { ...msg, content, isStreaming: false } : msg,
          ),
        );
        await refreshReviews();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Question failed";
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? { ...msg, content: message, isStreaming: false }
              : msg,
          ),
        );
      } finally {
        setIsAsking(false);
      }
    },
    [activeReviewId, refreshReviews],
  );

  return {
    reviews,
    activeReviewId,
    review,
    prUrl,
    setPrUrl,
    meta,
    messages,
    error,
    isLoading,
    isStreaming,
    isAsking,
    isHistoryLoading,
    startNewReview,
    loadReview,
    deleteReview,
    reviewPr,
    askAboutReview,
  };
}
