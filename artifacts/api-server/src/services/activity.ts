import { desc, eq } from "drizzle-orm";
import {
  db,
  githubActivityEventsTable,
  prReviewsTable,
  type ActivityCommit,
  type ActivitySource,
  type GithubActivityEvent,
} from "@workspace/db";
import {
  clearGitHubAccessToken,
  getGitHubOAuthAccount,
} from "./auth";
import { decryptToken } from "../lib/token-crypto";
import {
  fetchPublicActivityEvents,
  GitHubAuthError,
  type GitHubPullRequestEvent,
  type GitHubPushEvent,
} from "../lib/github-user";
import { aiBackendHeaders, getAiBackendUrl } from "../lib/ai-backend";
import { canUserSendChat, recordChatUsage } from "./usage";

export type ActivityItem = {
  id: string;
  source: ActivitySource;
  repo: string;
  ref: string | null;
  branch: string | null;
  sha: string | null;
  commits: ActivityCommit[];
  prNumber: number | null;
  summary: string | null;
  occurredAt: string;
};

function toItem(row: GithubActivityEvent): ActivityItem {
  return {
    id: row.id,
    source: row.source,
    repo: row.repo,
    ref: row.ref,
    branch: row.branch,
    sha: row.sha,
    commits: row.commits ?? [],
    prNumber: row.prNumber,
    summary: row.summary,
    occurredAt: row.occurredAt.toISOString(),
  };
}

export async function listActivityForUser(userId: string): Promise<ActivityItem[]> {
  const rows = await db
    .select()
    .from(githubActivityEventsTable)
    .where(eq(githubActivityEventsTable.userId, userId))
    .orderBy(desc(githubActivityEventsTable.occurredAt))
    .limit(100);
  return rows.map(toItem);
}

async function upsertPushEvents(
  userId: string,
  pushes: GitHubPushEvent[],
): Promise<void> {
  for (const push of pushes) {
    const dedupKey = `oauth_push:${push.id}`;
    await db
      .insert(githubActivityEventsTable)
      .values({
        userId,
        source: "oauth_push",
        dedupKey,
        repo: push.repo,
        ref: push.ref,
        branch: push.branch,
        sha: push.sha,
        commits: push.commits,
        prNumber: null,
        summary: null,
        occurredAt: push.occurredAt,
      })
      .onConflictDoUpdate({
        target: [
          githubActivityEventsTable.userId,
          githubActivityEventsTable.dedupKey,
        ],
        set: {
          repo: push.repo,
          ref: push.ref,
          branch: push.branch,
          sha: push.sha,
          commits: push.commits,
          occurredAt: push.occurredAt,
        },
      });
  }
}

async function upsertPullRequestEvents(
  userId: string,
  prs: GitHubPullRequestEvent[],
): Promise<void> {
  for (const pr of prs) {
    const dedupKey = `oauth_pr:${pr.id}`;
    const summary = [pr.action, pr.title].filter(Boolean).join(": ").slice(0, 500) || null;
    await db
      .insert(githubActivityEventsTable)
      .values({
        userId,
        source: "oauth_pr",
        dedupKey,
        repo: pr.repo,
        ref: pr.branch ? `refs/heads/${pr.branch}` : null,
        branch: pr.branch,
        sha: pr.sha,
        commits: [],
        prNumber: pr.prNumber,
        summary,
        occurredAt: pr.occurredAt,
      })
      .onConflictDoUpdate({
        target: [
          githubActivityEventsTable.userId,
          githubActivityEventsTable.dedupKey,
        ],
        set: {
          repo: pr.repo,
          ref: pr.branch ? `refs/heads/${pr.branch}` : null,
          branch: pr.branch,
          sha: pr.sha,
          prNumber: pr.prNumber,
          summary,
          occurredAt: pr.occurredAt,
        },
      });
  }
}

export type SyncActivityResult = {
  events: ActivityItem[];
  githubLogin: string | null;
  synced: number;
  needsGitHubAuth: boolean;
  error?: string;
};

export async function syncPushActivity(userId: string): Promise<SyncActivityResult> {
  const account = await getGitHubOAuthAccount(userId);
  if (!account?.providerLogin || !account.accessTokenEncrypted) {
    const events = await listActivityForUser(userId);
    return {
      events,
      githubLogin: account?.providerLogin ?? null,
      synced: 0,
      needsGitHubAuth: true,
      error: account?.providerLogin
        ? "GitHub token missing. Sign in with GitHub again."
        : "Connect GitHub to sync your public push history.",
    };
  }

  let token: string;
  try {
    token = decryptToken(account.accessTokenEncrypted);
  } catch {
    await clearGitHubAccessToken(userId);
    return {
      events: await listActivityForUser(userId),
      githubLogin: account.providerLogin,
      synced: 0,
      needsGitHubAuth: true,
      error: "Could not decrypt GitHub token. Sign in with GitHub again.",
    };
  }

  try {
    const activity = await fetchPublicActivityEvents(account.providerLogin, token);
    await upsertPushEvents(userId, activity.pushes);
    await upsertPullRequestEvents(userId, activity.pullRequests);
    return {
      events: await listActivityForUser(userId),
      githubLogin: account.providerLogin,
      synced: activity.pushes.length + activity.pullRequests.length,
      needsGitHubAuth: false,
    };
  } catch (err) {
    if (err instanceof GitHubAuthError) {
      await clearGitHubAccessToken(userId);
      return {
        events: await listActivityForUser(userId),
        githubLogin: account.providerLogin,
        synced: 0,
        needsGitHubAuth: true,
        error: err.message,
      };
    }
    throw err;
  }
}

export type WebhookPrActivityInput = {
  githubLogin: string;
  repo: string;
  prNumber: number;
  sha?: string | null;
  branch?: string | null;
  review?: string | null;
  occurredAt?: string | null;
};

export async function recordWebhookPrActivity(
  userId: string,
  input: WebhookPrActivityInput,
): Promise<{ activityId: string; prReviewId: string | null }> {
  const sha = input.sha?.trim() || "unknown";
  const dedupKey = `webhook_pr:${input.repo}#${input.prNumber}@${sha}`;
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  const summary =
    typeof input.review === "string" && input.review.trim()
      ? input.review.trim().slice(0, 4000)
      : null;

  const [row] = await db
    .insert(githubActivityEventsTable)
    .values({
      userId,
      source: "webhook_pr",
      dedupKey,
      repo: input.repo,
      ref: input.branch ? `refs/heads/${input.branch}` : null,
      branch: input.branch ?? null,
      sha: input.sha ?? null,
      commits: [],
      prNumber: input.prNumber,
      summary,
      occurredAt,
    })
    .onConflictDoUpdate({
      target: [
        githubActivityEventsTable.userId,
        githubActivityEventsTable.dedupKey,
      ],
      set: {
        ...(summary ? { summary } : {}),
        ...(input.branch ? { branch: input.branch } : {}),
        ...(input.sha ? { sha: input.sha } : {}),
        occurredAt,
      },
    })
    .returning();

  let prReviewId: string | null = null;
  if (summary) {
    const prUrl = `https://github.com/${input.repo}/pull/${input.prNumber}`;
    const matches = await db
      .select()
      .from(prReviewsTable)
      .where(eq(prReviewsTable.userId, userId));

    const match = matches.find(
      (r) => r.repo === input.repo && r.prNumber === input.prNumber,
    );

    if (match) {
      await db
        .update(prReviewsTable)
        .set({ review: summary, updatedAt: new Date() })
        .where(eq(prReviewsTable.id, match.id));
      prReviewId = match.id;
    } else {
      const [created] = await db
        .insert(prReviewsTable)
        .values({
          userId,
          prUrl,
          repo: input.repo,
          prNumber: input.prNumber,
          title: `${input.repo} #${input.prNumber}`,
          review: summary,
        })
        .returning();
      prReviewId = created?.id ?? null;
    }
  }

  void import("./dna")
    .then(({ scheduleEngineeringProfileRebuild }) => {
      scheduleEngineeringProfileRebuild(userId, { reason: "webhook_pr" });
    })
    .catch(() => {
      /* DNA rebuild is best-effort; never fail webhook activity write */
    });

  return { activityId: row!.id, prReviewId };
}

let cachedSummary: { userId: string; text: string; at: number } | null = null;
const SUMMARY_TTL_MS = 5 * 60 * 1000;

export async function summarizeRecentPushes(userId: string): Promise<{
  summary: string;
  pushCount: number;
}> {
  if (
    cachedSummary &&
    cachedSummary.userId === userId &&
    Date.now() - cachedSummary.at < SUMMARY_TTL_MS
  ) {
    const events = await listActivityForUser(userId);
    const pushCount = events.filter((e) => e.source === "oauth_push").length;
    return { summary: cachedSummary.text, pushCount };
  }

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

  const events = await listActivityForUser(userId);
  const pushes = events.filter((e) => e.source === "oauth_push").slice(0, 15);
  if (pushes.length === 0) {
    return {
      summary: "No recent public pushes found. Sync activity after signing in with GitHub.",
      pushCount: 0,
    };
  }

  const lines = pushes.map((p) => {
    const commitMsgs = p.commits
      .slice(0, 3)
      .map((c) => c.message.split("\n")[0])
      .join("; ");
    return `- ${p.repo} @ ${p.branch ?? p.ref ?? "unknown"} (${p.occurredAt}): ${commitMsgs || p.sha || "push"}`;
  });

  const prompt = [
    "Summarize what this developer has pushed recently in 2-4 short sentences.",
    "Be concrete about repos and themes. Public activity only.",
    "",
    "Recent public pushes:",
    ...lines,
  ].join("\n");

  const upstream = await fetch(`${getAiBackendUrl()}/chat`, {
    method: "POST",
    headers: aiBackendHeaders(),
    body: JSON.stringify({
      message: prompt,
      user_id: userId,
      history: [],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    throw new Error(text || "Failed to generate push summary.");
  }

  let summary = "";
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6);
        let token: string;
        try {
          token = JSON.parse(raw) as string;
        } catch {
          token = raw;
        }
        if (
          token === "[DONE]" ||
          token.startsWith("[CONTEXT:") ||
          token.startsWith("[SOURCES:") ||
          token.startsWith("[PROVIDER:")
        ) {
          continue;
        }
        summary += token;
      }
    }
  }

  summary = summary.trim() || "Unable to summarize recent pushes.";
  await recordChatUsage(userId);
  cachedSummary = { userId, text: summary, at: Date.now() };
  return { summary, pushCount: pushes.length };
}
