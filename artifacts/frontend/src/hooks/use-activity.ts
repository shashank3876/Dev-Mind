import { useCallback, useState } from "react";

export type ActivityCommit = {
  sha: string;
  message: string;
};

export type ActivityItem = {
  id: string;
  source: "oauth_push" | "oauth_pr" | "webhook_pr";
  repo: string;
  ref: string | null;
  branch: string | null;
  sha: string | null;
  commits: ActivityCommit[];
  prNumber: number | null;
  summary: string | null;
  occurredAt: string;
};

export type SyncResult = {
  events: ActivityItem[];
  githubLogin: string | null;
  synced: number;
  needsGitHubAuth: boolean;
  error?: string;
};

function apiErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "message" in data) {
    const msg = (data as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}

export function useActivity() {
  const [events, setEvents] = useState<ActivityItem[]>([]);
  const [githubLogin, setGithubLogin] = useState<string | null>(null);
  const [needsGitHubAuth, setNeedsGitHubAuth] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(async () => {
    setIsSyncing(true);
    setError(null);
    setSyncError(null);
    try {
      const response = await fetch("/api/activity/sync", {
        method: "POST",
        credentials: "include",
      });
      const data = (await response.json().catch(() => null)) as SyncResult | null;
      if (!response.ok || !data) {
        throw new Error(apiErrorMessage(data, `Sync failed (${response.status})`));
      }
      setEvents(data.events ?? []);
      setGithubLogin(data.githubLogin);
      setNeedsGitHubAuth(Boolean(data.needsGitHubAuth));
      if (data.error) setSyncError(data.error);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to sync activity.";
      setError(message);
      throw err;
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const loadCached = useCallback(async () => {
    const response = await fetch("/api/activity", { credentials: "include" });
    if (!response.ok) return;
    const data = (await response.json()) as { events?: ActivityItem[] };
    setEvents(data.events ?? []);
  }, []);

  const summarize = useCallback(async () => {
    setIsSummarizing(true);
    setError(null);
    try {
      const response = await fetch("/api/activity/summarize", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (data?.code === "quota_exceeded") {
          throw new Error("Monthly chat quota reached. Upgrade or wait until next month.");
        }
        throw new Error(apiErrorMessage(data, `Summarize failed (${response.status})`));
      }
      setSummary(typeof data?.summary === "string" ? data.summary : null);
      return data?.summary as string;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to summarize pushes.";
      setError(message);
      throw err;
    } finally {
      setIsSummarizing(false);
    }
  }, []);

  return {
    events,
    githubLogin,
    needsGitHubAuth,
    syncError,
    summary,
    isSyncing,
    isSummarizing,
    error,
    sync,
    loadCached,
    summarize,
  };
}
