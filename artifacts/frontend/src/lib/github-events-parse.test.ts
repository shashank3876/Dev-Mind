/**
 * Mirrors api-server public Events parsing rules for PushEvent + PullRequestEvent.
 * Kept in frontend vitest because api-server has no test runner.
 */
import { describe, expect, it } from "vitest";

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
    };
  };
};

function parsePublicEvents(events: RawEvent[]) {
  const pushes: Array<{ id: string; repo: string }> = [];
  const pullRequests: Array<{ id: string; repo: string; prNumber: number; action: string }> =
    [];

  for (const event of events) {
    if (!event.id || !event.repo?.name) continue;
    if (event.type === "PushEvent") {
      pushes.push({ id: event.id, repo: event.repo.name });
      continue;
    }
    if (event.type === "PullRequestEvent") {
      const prNumber = event.payload?.pull_request?.number;
      if (typeof prNumber !== "number") continue;
      pullRequests.push({
        id: event.id,
        repo: event.repo.name,
        prNumber,
        action: event.payload?.action ?? "unknown",
      });
    }
  }
  return { pushes, pullRequests };
}

describe("parsePublicEvents", () => {
  it("maps PushEvent and PullRequestEvent", () => {
    const result = parsePublicEvents([
      {
        id: "1",
        type: "PushEvent",
        repo: { name: "acme/app" },
        payload: { ref: "refs/heads/main", commits: [{ sha: "abc", message: "fix" }] },
      },
      {
        id: "2",
        type: "PullRequestEvent",
        repo: { name: "acme/app" },
        payload: {
          action: "opened",
          pull_request: { number: 42, title: "Add DNA", head: { sha: "def", ref: "feat" } },
        },
      },
      {
        id: "3",
        type: "WatchEvent",
        repo: { name: "acme/app" },
      },
    ]);

    expect(result.pushes).toEqual([{ id: "1", repo: "acme/app" }]);
    expect(result.pullRequests).toEqual([
      { id: "2", repo: "acme/app", prNumber: 42, action: "opened" },
    ]);
  });

  it("skips PullRequestEvent without number", () => {
    const result = parsePublicEvents([
      {
        id: "9",
        type: "PullRequestEvent",
        repo: { name: "acme/app" },
        payload: { action: "closed", pull_request: {} },
      },
    ]);
    expect(result.pullRequests).toEqual([]);
  });
});
