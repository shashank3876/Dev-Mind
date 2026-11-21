import { useCallback, useState } from "react";

export type DnaEvidenceRef = {
  type: "push" | "pr" | "review" | "diff" | "commit";
  repo: string;
  prNumber?: number | null;
  sha?: string | null;
  url?: string | null;
  excerpt?: string | null;
  evidenceId?: string | null;
};

export type DnaInsight = {
  id: string;
  category: string;
  kind: "strength" | "improvement" | "pattern" | "recommendation" | string;
  title: string;
  detail: string;
  confidence: "high" | "medium" | "low" | "insufficient" | string;
  evidence: DnaEvidenceRef[];
  createdAt: string;
};

export type DnaEvidenceStats = {
  pushCount: number;
  prCount: number;
  reviewCount: number;
  diffCount: number;
};

export type DnaProfile = {
  id: string;
  status: "ready" | "building" | "stale" | "insufficient_data" | string;
  summary: string | null;
  evidenceStats: DnaEvidenceStats;
  analyzedAt: string | null;
  updatedAt: string;
  insights: DnaInsight[];
};

function apiErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "message" in data) {
    const msg = (data as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}

export function useDna() {
  const [profile, setProfile] = useState<DnaProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/dna", { credentials: "include" });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(apiErrorMessage(data, `Failed to load DNA (${response.status})`));
      }
      setProfile((data?.profile as DnaProfile | null) ?? null);
      return data?.profile as DnaProfile | null;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load engineering profile.";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const rebuild = useCallback(async () => {
    setIsRebuilding(true);
    setError(null);
    try {
      const response = await fetch("/api/dna/rebuild", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (data?.code === "quota_exceeded") {
          throw new Error("Monthly chat quota reached. Upgrade or wait until next month.");
        }
        throw new Error(apiErrorMessage(data, `Rebuild failed (${response.status})`));
      }
      setProfile((data?.profile as DnaProfile | null) ?? null);
      return data?.profile as DnaProfile | null;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to rebuild engineering profile.";
      setError(message);
      throw err;
    } finally {
      setIsRebuilding(false);
    }
  }, []);

  return {
    profile,
    isLoading,
    isRebuilding,
    error,
    load,
    rebuild,
  };
}
