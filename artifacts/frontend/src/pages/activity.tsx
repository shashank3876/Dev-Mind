import { useEffect } from "react";
import { GitCommitHorizontal, GitPullRequest, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";
import { useActivity, type ActivityItem } from "@/hooks/use-activity";
import { ChatMarkdown } from "@/components/chat-markdown";

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const isPush = item.source === "oauth_push";
  const isOauthPr = item.source === "oauth_pr";
  const title = isPush
    ? `Pushed to ${item.repo}`
    : isOauthPr
      ? `PR · ${item.repo} #${item.prNumber}`
      : `PR review · ${item.repo} #${item.prNumber}`;
  const detail = isPush
    ? item.commits[0]?.message.split("\n")[0] ||
      item.branch ||
      item.ref ||
      item.sha ||
      "Public push"
    : item.summary?.slice(0, 180) ||
      (isOauthPr ? "Public pull request activity" : "Automated DevMind review");

  return (
    <li className="flex gap-3 rounded-xl border border-border/50 bg-card/40 px-4 py-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary/60 ring-1 ring-border/40">
        {isPush ? (
          <GitCommitHorizontal className="h-4 w-4 text-primary" />
        ) : (
          <GitPullRequest className="h-4 w-4 text-primary" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-medium text-sm truncate">{title}</p>
          <time className="text-[11px] font-mono text-muted-foreground shrink-0">
            {formatWhen(item.occurredAt)}
          </time>
        </div>
        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{detail}</p>
        {isPush && item.branch && (
          <p className="mt-1 text-[11px] font-mono text-muted-foreground/80">
            {item.branch}
            {item.commits.length > 1 ? ` · ${item.commits.length} commits` : ""}
          </p>
        )}
        {!isPush && item.prNumber != null && (
          <a
            href={`https://github.com/${item.repo}/pull/${item.prNumber}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-xs text-cyan-300 hover:text-cyan-200"
          >
            Open PR #{item.prNumber}
          </a>
        )}
      </div>
    </li>
  );
}

export default function ActivityPage() {
  const { isAuthenticated, isLoading: isAuthLoading, user, loginWithGitHub } = useAuth();
  const {
    events,
    githubLogin,
    needsGitHubAuth,
    syncError,
    summary,
    isSyncing,
    isSummarizing,
    error,
    sync,
    summarize,
  } = useActivity();

  useEffect(() => {
    if (!isAuthenticated) return;
    void sync();
  }, [isAuthenticated, sync]);

  const displayLogin = githubLogin ?? user?.githubLogin ?? null;
  const pushes = events.filter((e) => e.source === "oauth_push");

  return (
    <div className="flex h-screen max-h-screen bg-background text-foreground font-sans">
      <div className="flex flex-col flex-1 min-w-0">
        <AppHeader
          badge="Activity"
          navLinks={[
            { href: "/", label: "Chat" },
            { href: "/dna", label: "DNA" },
            { href: "/review", label: "Review a PR" },
          ]}
        />

        {!isAuthLoading && !isAuthenticated && (
          <div className="flex-none px-6 py-3 bg-primary/5 border-b border-primary/10 text-center text-sm text-muted-foreground">
            <span className="text-primary font-medium">Sign in with GitHub</span> to see your
            public push history and linked PR reviews.
          </div>
        )}

        <ScrollArea className="flex-1 w-full">
          <div className="max-w-3xl mx-auto py-8 px-4 md:px-0 flex flex-col gap-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Your GitHub activity</h2>
              <p className="mt-2 text-sm text-muted-foreground max-w-xl">
                Public pushes from your GitHub account, plus DevMind PR reviews linked when the
                webhook author matches your login.
              </p>
              {displayLogin && (
                <p className="mt-2 text-xs font-mono text-muted-foreground">
                  Connected as @{displayLogin}
                </p>
              )}
            </div>

            {isAuthenticated && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void sync()}
                  disabled={isSyncing}
                >
                  {isSyncing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Sync pushes
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => void summarize()}
                  disabled={isSummarizing || pushes.length === 0}
                >
                  {isSummarizing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Summarize recent pushes
                </Button>
                {needsGitHubAuth && (
                  <Button variant="outline" size="sm" onClick={loginWithGitHub}>
                    Connect GitHub
                  </Button>
                )}
              </div>
            )}

            {(error || syncError) && (
              <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error || syncError}
              </div>
            )}

            {summary && (
              <div className="rounded-xl border border-border/60 bg-card/50 px-4 py-4">
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
                  Push summary
                </p>
                <ChatMarkdown content={summary} />
              </div>
            )}

            {!isAuthLoading && isAuthenticated && events.length === 0 && !isSyncing && (
              <div className="rounded-xl border border-dashed border-border/60 px-6 py-10 text-center text-sm text-muted-foreground">
                {needsGitHubAuth
                  ? "Sign in with GitHub to sync your public push history."
                  : "No public pushes or linked PR reviews yet. Push to a public repo or wait for a webhook review."}
              </div>
            )}

            {events.length > 0 && (
              <ul className="flex flex-col gap-3">
                {events.map((item) => (
                  <ActivityRow key={item.id} item={item} />
                ))}
              </ul>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
