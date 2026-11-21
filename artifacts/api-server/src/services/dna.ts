import { desc, eq } from "drizzle-orm";
import {
  db,
  engineeringInsightsTable,
  engineeringProfilesTable,
  prReviewsTable,
  type EngineeringEvidenceRef,
  type EngineeringEvidenceStats,
  type EngineeringInsightCategory,
  type EngineeringInsightConfidence,
  type EngineeringInsightKind,
  type EngineeringProfile,
  type EngineeringProfileStatus,
} from "@workspace/db";
import {
  fetchPublicPrDiff,
  type PublicPrDiff,
} from "../lib/github-user";
import { decryptToken } from "../lib/token-crypto";
import { aiBackendHeaders, getAiBackendUrl } from "../lib/ai-backend";
import { logger } from "../lib/logger";
import { getGitHubOAuthAccount } from "./auth";
import { listActivityForUser, syncPushActivity } from "./activity";
import { canUserSendChat, recordChatUsage } from "./usage";

const MAX_PR_DIFFS = 10;
const MIN_PUSHES = 3;
const MIN_PR_OR_REVIEW = 1;

const CATEGORIES = new Set([
  "backend",
  "code_quality",
  "system_design",
  "database",
  "testing",
  "security",
  "performance",
  "error_handling",
]);

const KINDS = new Set(["strength", "improvement", "pattern", "recommendation"]);
const CONFIDENCES = new Set(["high", "medium", "low", "insufficient"]);

export type DnaInsightView = {
  id: string;
  category: EngineeringInsightCategory;
  kind: EngineeringInsightKind;
  title: string;
  detail: string;
  confidence: EngineeringInsightConfidence;
  evidence: EngineeringEvidenceRef[];
  createdAt: string;
};

export type DnaProfileView = {
  id: string;
  status: EngineeringProfileStatus;
  summary: string | null;
  evidenceStats: EngineeringEvidenceStats;
  analyzedAt: string | null;
  updatedAt: string;
  insights: DnaInsightView[];
};

type EvidenceItem = {
  id: string;
  type: "push" | "pr" | "review" | "diff" | "commit";
  repo: string;
  prNumber?: number | null;
  sha?: string | null;
  url?: string | null;
  excerpt: string;
};

type AnalyzeInsight = {
  category: string;
  kind: string;
  title: string;
  detail: string;
  confidence: string;
  evidenceIds: string[];
};

type AnalyzeResponse = {
  summary?: string | null;
  insights?: AnalyzeInsight[];
};

const rebuilding = new Set<string>();

function emptyStats(): EngineeringEvidenceStats {
  return { pushCount: 0, prCount: 0, reviewCount: 0, diffCount: 0 };
}

function githubPrUrl(repo: string, prNumber: number): string {
  return `https://github.com/${repo}/pull/${prNumber}`;
}

function githubCommitUrl(repo: string, sha: string): string {
  return `https://github.com/${repo}/commit/${sha}`;
}

async function ensureProfileRow(userId: string): Promise<EngineeringProfile> {
  const existing = await db
    .select()
    .from(engineeringProfilesTable)
    .where(eq(engineeringProfilesTable.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(engineeringProfilesTable)
    .values({
      userId,
      status: "insufficient_data",
      summary: null,
      evidenceStats: emptyStats(),
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const again = await db
    .select()
    .from(engineeringProfilesTable)
    .where(eq(engineeringProfilesTable.userId, userId))
    .limit(1);
  return again[0]!;
}

async function setProfileStatus(
  userId: string,
  status: EngineeringProfileStatus,
  patch?: Partial<{
    summary: string | null;
    evidenceStats: EngineeringEvidenceStats;
    analyzedAt: Date | null;
  }>,
): Promise<EngineeringProfile> {
  const row = await ensureProfileRow(userId);
  const [updated] = await db
    .update(engineeringProfilesTable)
    .set({
      status,
      updatedAt: new Date(),
      ...(patch?.summary !== undefined ? { summary: patch.summary } : {}),
      ...(patch?.evidenceStats ? { evidenceStats: patch.evidenceStats } : {}),
      ...(patch?.analyzedAt !== undefined ? { analyzedAt: patch.analyzedAt } : {}),
    })
    .where(eq(engineeringProfilesTable.id, row.id))
    .returning();
  return updated!;
}

export async function getEngineeringProfile(
  userId: string,
): Promise<DnaProfileView | null> {
  const rows = await db
    .select()
    .from(engineeringProfilesTable)
    .where(eq(engineeringProfilesTable.userId, userId))
    .limit(1);
  const profile = rows[0];
  if (!profile) return null;

  const insights = await db
    .select()
    .from(engineeringInsightsTable)
    .where(eq(engineeringInsightsTable.profileId, profile.id))
    .orderBy(desc(engineeringInsightsTable.createdAt));

  return {
    id: profile.id,
    status: profile.status,
    summary: profile.summary,
    evidenceStats: profile.evidenceStats ?? emptyStats(),
    analyzedAt: profile.analyzedAt?.toISOString() ?? null,
    updatedAt: profile.updatedAt.toISOString(),
    insights: insights.map((i) => ({
      id: i.id,
      category: i.category,
      kind: i.kind,
      title: i.title,
      detail: i.detail,
      confidence: i.confidence,
      evidence: i.evidence ?? [],
      createdAt: i.createdAt.toISOString(),
    })),
  };
}

export async function markEngineeringProfileStale(userId: string): Promise<void> {
  const rows = await db
    .select()
    .from(engineeringProfilesTable)
    .where(eq(engineeringProfilesTable.userId, userId))
    .limit(1);
  if (!rows[0]) {
    await ensureProfileRow(userId);
  }
  await setProfileStatus(userId, "stale");
}

async function resolveAccessToken(userId: string): Promise<string | null> {
  const account = await getGitHubOAuthAccount(userId);
  if (!account?.accessTokenEncrypted) return null;
  try {
    return decryptToken(account.accessTokenEncrypted);
  } catch {
    return null;
  }
}

async function gatherEvidence(userId: string): Promise<{
  items: EvidenceItem[];
  stats: EngineeringEvidenceStats;
  bundle: Record<string, unknown>;
}> {
  const events = await listActivityForUser(userId);
  const reviews = await db
    .select()
    .from(prReviewsTable)
    .where(eq(prReviewsTable.userId, userId))
    .orderBy(desc(prReviewsTable.updatedAt))
    .limit(30);

  const token = await resolveAccessToken(userId);
  const items: EvidenceItem[] = [];
  let seq = 0;
  const nextId = (prefix: string) => {
    seq += 1;
    return `${prefix}_${seq}`;
  };

  const pushes = events.filter((e) => e.source === "oauth_push");
  for (const push of pushes.slice(0, 25)) {
    const commitLines = push.commits
      .slice(0, 5)
      .map((c) => c.message.split("\n")[0])
      .join("; ");
    const sha = push.sha ?? push.commits[0]?.sha ?? null;
    items.push({
      id: nextId("push"),
      type: "push",
      repo: push.repo,
      sha,
      url: sha ? githubCommitUrl(push.repo, sha) : null,
      excerpt: `${push.repo} @ ${push.branch ?? "unknown"}: ${commitLines || "push"}`,
    });
    for (const c of push.commits.slice(0, 3)) {
      items.push({
        id: nextId("commit"),
        type: "commit",
        repo: push.repo,
        sha: c.sha,
        url: githubCommitUrl(push.repo, c.sha),
        excerpt: c.message.split("\n")[0].slice(0, 300),
      });
    }
  }

  const prEvents = events.filter(
    (e) =>
      (e.source === "oauth_pr" || e.source === "webhook_pr") &&
      e.prNumber != null,
  );

  const seenPr = new Set<string>();
  const uniquePrs: Array<{ repo: string; prNumber: number; sha: string | null; summary: string | null }> =
    [];
  for (const pr of prEvents) {
    const key = `${pr.repo}#${pr.prNumber}`;
    if (seenPr.has(key)) continue;
    seenPr.add(key);
    uniquePrs.push({
      repo: pr.repo,
      prNumber: pr.prNumber!,
      sha: pr.sha,
      summary: pr.summary,
    });
  }

  for (const pr of uniquePrs.slice(0, 20)) {
    items.push({
      id: nextId("pr"),
      type: "pr",
      repo: pr.repo,
      prNumber: pr.prNumber,
      sha: pr.sha,
      url: githubPrUrl(pr.repo, pr.prNumber),
      excerpt: (pr.summary || `PR #${pr.prNumber}`).slice(0, 500),
    });
  }

  for (const review of reviews) {
    items.push({
      id: nextId("review"),
      type: "review",
      repo: review.repo,
      prNumber: review.prNumber,
      url: review.prUrl || githubPrUrl(review.repo, review.prNumber),
      excerpt: review.review.slice(0, 1500),
    });
  }

  let diffCount = 0;
  const diffs: PublicPrDiff[] = [];
  for (const pr of uniquePrs.slice(0, MAX_PR_DIFFS)) {
    try {
      const diff = await fetchPublicPrDiff(pr.repo, pr.prNumber, token);
      if (!diff || !diff.truncatedText) continue;
      diffs.push(diff);
      diffCount += 1;
      items.push({
        id: nextId("diff"),
        type: "diff",
        repo: pr.repo,
        prNumber: pr.prNumber,
        url: githubPrUrl(pr.repo, pr.prNumber),
        excerpt: diff.truncatedText.slice(0, 2500),
      });
    } catch (err) {
      logger.warn({ err, repo: pr.repo, pr: pr.prNumber }, "Failed to fetch public PR diff");
    }
  }

  const stats: EngineeringEvidenceStats = {
    pushCount: pushes.length,
    prCount: uniquePrs.length,
    reviewCount: reviews.length,
    diffCount,
  };

  const bundle = {
    note: "Public GitHub activity and DevMind reviews only. Do not invent evidence.",
    stats,
    items: items.map((i) => ({
      id: i.id,
      type: i.type,
      repo: i.repo,
      prNumber: i.prNumber ?? null,
      sha: i.sha ?? null,
      url: i.url ?? null,
      excerpt: i.excerpt,
    })),
  };

  return { items, stats, bundle };
}

function mapEvidence(
  evidenceIds: string[],
  byId: Map<string, EvidenceItem>,
): EngineeringEvidenceRef[] {
  const refs: EngineeringEvidenceRef[] = [];
  for (const id of evidenceIds) {
    const item = byId.get(id);
    if (!item) continue;
    refs.push({
      type: item.type,
      repo: item.repo,
      prNumber: item.prNumber ?? null,
      sha: item.sha ?? null,
      url: item.url ?? null,
      excerpt: item.excerpt.slice(0, 280),
      evidenceId: item.id,
    });
  }
  return refs;
}

function validateInsights(
  insights: AnalyzeInsight[] | undefined,
  byId: Map<string, EvidenceItem>,
): Array<{
  category: EngineeringInsightCategory;
  kind: EngineeringInsightKind;
  title: string;
  detail: string;
  confidence: EngineeringInsightConfidence;
  evidence: EngineeringEvidenceRef[];
}> {
  const out: Array<{
    category: EngineeringInsightCategory;
    kind: EngineeringInsightKind;
    title: string;
    detail: string;
    confidence: EngineeringInsightConfidence;
    evidence: EngineeringEvidenceRef[];
  }> = [];

  for (const raw of insights ?? []) {
    if (!CATEGORIES.has(raw.category)) continue;
    if (!KINDS.has(raw.kind)) continue;
    if (!CONFIDENCES.has(raw.confidence)) continue;
    if (!raw.title?.trim() || !raw.detail?.trim()) continue;
    const evidence = mapEvidence(raw.evidenceIds ?? [], byId);
    if (evidence.length === 0) continue;
    out.push({
      category: raw.category as EngineeringInsightCategory,
      kind: raw.kind as EngineeringInsightKind,
      title: raw.title.trim().slice(0, 200),
      detail: raw.detail.trim().slice(0, 2000),
      confidence: raw.confidence as EngineeringInsightConfidence,
      evidence,
    });
  }
  return out;
}

async function ingestDnaToQdrant(
  userId: string,
  summary: string | null,
  insights: Array<{ kind: string; category: string; title: string; detail: string }>,
): Promise<void> {
  const lines = [
    "Engineering DNA profile",
    summary ? `Summary: ${summary}` : "",
    ...insights.map(
      (i) => `- [${i.kind}/${i.category}] ${i.title}: ${i.detail}`,
    ),
  ].filter(Boolean);
  const text = lines.join("\n");
  if (!text.trim()) return;

  try {
    const res = await fetch(`${getAiBackendUrl()}/ingest`, {
      method: "POST",
      headers: aiBackendHeaders(),
      body: JSON.stringify({
        text,
        metadata: {
          user_id: userId,
          source: "engineering_dna",
          doc_id: `dna:${userId}`,
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn({ status: res.status, body }, "DNA Qdrant ingest failed");
    }
  } catch (err) {
    logger.warn({ err }, "DNA Qdrant ingest error");
  }
}

async function callDnaAnalyze(
  userId: string,
  evidence: Record<string, unknown>,
): Promise<AnalyzeResponse> {
  const res = await fetch(`${getAiBackendUrl()}/dna/analyze`, {
    method: "POST",
    headers: aiBackendHeaders(),
    body: JSON.stringify({
      user_id: userId,
      evidence,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `DNA analyze failed (${res.status})`);
  }
  return (await res.json()) as AnalyzeResponse;
}

export async function rebuildEngineeringProfile(
  userId: string,
  opts?: { reason?: string; syncFirst?: boolean; enforceQuota?: boolean },
): Promise<DnaProfileView> {
  const enforceQuota = opts?.enforceQuota !== false;

  if (rebuilding.has(userId)) {
    const current = await getEngineeringProfile(userId);
    if (current) return current;
  }

  rebuilding.add(userId);
  try {
    if (opts?.syncFirst) {
      try {
        await syncPushActivity(userId);
      } catch (err) {
        logger.warn({ err, userId }, "DNA sync before rebuild failed");
      }
    }

    if (enforceQuota) {
      const usage = await canUserSendChat(userId);
      if (!usage.canSend) {
        const err = new Error("quota_exceeded") as Error & {
          code: string;
          used: number;
          limit: number;
          resetsAt: string;
        };
        err.code = "quota_exceeded";
        err.used = usage.used;
        err.limit = usage.limit;
        err.resetsAt = usage.resetsAt;
        throw err;
      }
    }

    await setProfileStatus(userId, "building");

    const { items, stats, bundle } = await gatherEvidence(userId);

    // Threshold: <3 pushes AND <1 PR/review → insufficient
    const insufficient =
      stats.pushCount < MIN_PUSHES &&
      stats.prCount < MIN_PR_OR_REVIEW &&
      stats.reviewCount < MIN_PR_OR_REVIEW;

    if (insufficient) {
      const profile = await setProfileStatus(userId, "insufficient_data", {
        summary:
          "Not enough public engineering evidence yet. Sync GitHub activity or wait for linked PR reviews.",
        evidenceStats: stats,
        analyzedAt: new Date(),
      });
      await db
        .delete(engineeringInsightsTable)
        .where(eq(engineeringInsightsTable.profileId, profile.id));
      return (await getEngineeringProfile(userId))!;
    }

    const analysis = await callDnaAnalyze(userId, bundle);
    const byId = new Map(items.map((i) => [i.id, i]));
    const validated = validateInsights(analysis.insights, byId);

    const profile = await setProfileStatus(userId, "ready", {
      summary: analysis.summary?.trim() || null,
      evidenceStats: stats,
      analyzedAt: new Date(),
    });

    await db
      .delete(engineeringInsightsTable)
      .where(eq(engineeringInsightsTable.profileId, profile.id));

    if (validated.length > 0) {
      await db.insert(engineeringInsightsTable).values(
        validated.map((v) => ({
          userId,
          profileId: profile.id,
          category: v.category,
          kind: v.kind,
          title: v.title,
          detail: v.detail,
          confidence: v.confidence,
          evidence: v.evidence,
        })),
      );
    }

    if (enforceQuota) {
      await recordChatUsage(userId);
    }

    await ingestDnaToQdrant(
      userId,
      analysis.summary?.trim() || null,
      validated,
    );

    logger.info(
      {
        userId,
        reason: opts?.reason ?? "manual",
        insightCount: validated.length,
        stats,
      },
      "Engineering DNA profile rebuilt",
    );

    return (await getEngineeringProfile(userId))!;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "quota_exceeded") {
      try {
        await setProfileStatus(userId, "stale");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    rebuilding.delete(userId);
  }
}

export function scheduleEngineeringProfileRebuild(
  userId: string,
  opts?: { reason?: string },
): void {
  void markEngineeringProfileStale(userId)
    .then(() =>
      rebuildEngineeringProfile(userId, {
        reason: opts?.reason ?? "async",
        syncFirst: false,
        enforceQuota: false,
      }),
    )
    .catch((err) => {
      logger.warn({ err, userId }, "Scheduled DNA rebuild failed");
    });
}
