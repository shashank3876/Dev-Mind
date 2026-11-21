export class GitHubAuthError extends Error {
  constructor(message = "GitHub authentication failed.") {
    super(message);
    this.name = "GitHubAuthError";
  }
}

export type GitHubPushCommit = {
  sha: string;
  message: string;
};

export type GitHubPushEvent = {
  id: string;
  repo: string;
  ref: string | null;
  branch: string | null;
  sha: string | null;
  commits: GitHubPushCommit[];
  occurredAt: Date;
};

export type GitHubPullRequestEvent = {
  id: string;
  repo: string;
  prNumber: number;
  action: string;
  sha: string | null;
  title: string | null;
  branch: string | null;
  occurredAt: Date;
};

export type GitHubPublicActivity = {
  pushes: GitHubPushEvent[];
  pullRequests: GitHubPullRequestEvent[];
};

export type PublicPrFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
};

export type PublicPrDiff = {
  repo: string;
  prNumber: number;
  files: PublicPrFile[];
  truncatedText: string;
};

const DEFAULT_DIFF_BUDGET = 10_000;

type RawEvent = {
  id?: string;
  type?: string;
  created_at?: string;
  repo?: { name?: string };
  payload?: {
    ref?: string;
    head?: string;
    action?: string;
    commits?: Array<{ sha?: string; message?: string }>;
    pull_request?: {
      number?: number;
      title?: string;
      head?: { sha?: string; ref?: string };
      merged?: boolean;
    };
  };
};

type RawPullFile = {
  filename?: string;
  status?: string;
  additions?: number;
  deletions?: number;
  patch?: string;
};

function branchFromRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  if (ref.startsWith("refs/heads/")) return ref.slice("refs/heads/".length);
  return ref;
}

function githubHeaders(accessToken?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "DevMind",
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

function parsePublicEvents(events: RawEvent[]): GitHubPublicActivity {
  const pushes: GitHubPushEvent[] = [];
  const pullRequests: GitHubPullRequestEvent[] = [];

  for (const event of events) {
    if (!event.id || !event.repo?.name) continue;
    const occurredAt = event.created_at ? new Date(event.created_at) : new Date();

    if (event.type === "PushEvent") {
      const ref = event.payload?.ref ?? null;
      const commits = (event.payload?.commits ?? [])
        .filter((c): c is { sha: string; message: string } => Boolean(c.sha && c.message))
        .map((c) => ({ sha: c.sha, message: c.message }));

      pushes.push({
        id: event.id,
        repo: event.repo.name,
        ref,
        branch: branchFromRef(ref),
        sha: event.payload?.head ?? commits[0]?.sha ?? null,
        commits,
        occurredAt,
      });
      continue;
    }

    if (event.type === "PullRequestEvent") {
      const pr = event.payload?.pull_request;
      const prNumber = pr?.number;
      if (typeof prNumber !== "number") continue;
      const action = event.payload?.action ?? "unknown";
      pullRequests.push({
        id: event.id,
        repo: event.repo.name,
        prNumber,
        action,
        sha: pr?.head?.sha ?? null,
        title: pr?.title ?? null,
        branch: pr?.head?.ref ?? null,
        occurredAt,
      });
    }
  }

  return { pushes, pullRequests };
}

/** @deprecated Prefer fetchPublicActivityEvents */
export async function fetchPublicPushEvents(
  login: string,
  accessToken: string,
  perPage = 30,
): Promise<GitHubPushEvent[]> {
  const activity = await fetchPublicActivityEvents(login, accessToken, perPage);
  return activity.pushes;
}

export async function fetchPublicActivityEvents(
  login: string,
  accessToken: string,
  perPage = 30,
): Promise<GitHubPublicActivity> {
  const url = `https://api.github.com/users/${encodeURIComponent(login)}/events/public?per_page=${perPage}`;
  const res = await fetch(url, {
    headers: githubHeaders(accessToken),
  });

  if (res.status === 401 || res.status === 403) {
    throw new GitHubAuthError("GitHub token is invalid or expired. Sign in with GitHub again.");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub events request failed (${res.status}): ${text}`);
  }

  const events = (await res.json()) as RawEvent[];
  return parsePublicEvents(events);
}

/** Exported for unit tests. */
export function parsePublicEventsForTest(events: RawEvent[]): GitHubPublicActivity {
  return parsePublicEvents(events);
}

/**
 * Fetch truncated public PR file patches. Returns null on 404/403 (private or missing).
 */
export async function fetchPublicPrDiff(
  repo: string,
  prNumber: number,
  accessToken?: string | null,
  budget = DEFAULT_DIFF_BUDGET,
): Promise<PublicPrDiff | null> {
  const [owner, name] = repo.split("/");
  if (!owner || !name) return null;

  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls/${prNumber}/files?per_page=100`;
  const res = await fetch(url, {
    headers: githubHeaders(accessToken),
  });

  if (res.status === 404 || res.status === 403) {
    return null;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub PR files request failed (${res.status}): ${text}`);
  }

  const rawFiles = (await res.json()) as RawPullFile[];
  const files: PublicPrFile[] = [];
  const parts: string[] = [];
  let remaining = budget;

  for (const f of rawFiles) {
    if (!f.filename) continue;
    const file: PublicPrFile = {
      filename: f.filename,
      status: f.status ?? "modified",
      additions: f.additions ?? 0,
      deletions: f.deletions ?? 0,
      patch: f.patch ?? null,
    };
    files.push(file);

    const header = `--- ${file.filename} (${file.status}, +${file.additions}/-${file.deletions})\n`;
    if (remaining <= 0) continue;
    parts.push(header.slice(0, remaining));
    remaining -= Math.min(header.length, remaining);
    if (file.patch && remaining > 0) {
      const patchSlice = file.patch.slice(0, remaining);
      parts.push(patchSlice);
      remaining -= patchSlice.length;
    }
  }

  return {
    repo,
    prNumber,
    files,
    truncatedText: parts.join("\n").trim(),
  };
}
