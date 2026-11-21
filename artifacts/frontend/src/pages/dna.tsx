import { useEffect } from "react";
import {
  Dna,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";
import { useDna, type DnaInsight } from "@/hooks/use-dna";
import { ChatMarkdown } from "@/components/chat-markdown";

const KIND_LABELS: Record<string, string> = {
  strength: "Strengths",
  improvement: "Improvement areas",
  pattern: "Recurring patterns",
  recommendation: "Recommendations",
};

const KIND_ORDER = ["strength", "improvement", "pattern", "recommendation"] as const;

function confidenceClass(confidence: string): string {
  switch (confidence) {
    case "high":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "medium":
      return "bg-amber-500/15 text-amber-200 border-amber-500/30";
    case "low":
      return "bg-orange-500/15 text-orange-200 border-orange-500/30";
    default:
      return "bg-muted text-muted-foreground border-border/50";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "building":
      return "Building…";
    case "stale":
      return "Stale — rebuild recommended";
    case "insufficient_data":
      return "Insufficient evidence";
    default:
      return status;
  }
}

function InsightCard({ insight }: { insight: DnaInsight }) {
  return (
    <li className="rounded-xl border border-border/50 bg-card/40 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm">{insight.title}</p>
          <p className="mt-0.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            {insight.category.replace(/_/g, " ")}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${confidenceClass(insight.confidence)}`}
        >
          {insight.confidence}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{insight.detail}</p>
      {insight.evidence.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {insight.evidence.map((ev, idx) => {
            const label =
              ev.prNumber != null
                ? `${ev.repo}#${ev.prNumber}`
                : ev.sha
                  ? `${ev.repo}@${ev.sha.slice(0, 7)}`
                  : ev.repo;
            return (
              <li key={`${insight.id}-ev-${idx}`} className="text-xs text-muted-foreground">
                {ev.url ? (
                  <a
                    href={ev.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {label}
                  </a>
                ) : (
                  <span className="font-mono">{label}</span>
                )}
                {ev.excerpt && (
                  <span className="ml-2 line-clamp-1 opacity-80">
                    — {ev.excerpt}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export default function DnaPage() {
  const { isAuthenticated, isLoading: isAuthLoading, loginWithGitHub } = useAuth();
  const { profile, isLoading, isRebuilding, error, load, rebuild } = useDna();

  useEffect(() => {
    if (!isAuthenticated) return;
    void load();
  }, [isAuthenticated, load]);

  const insightsByKind = KIND_ORDER.map((kind) => ({
    kind,
    label: KIND_LABELS[kind],
    items: (profile?.insights ?? []).filter((i) => i.kind === kind),
  })).filter((g) => g.items.length > 0);

  const stats = profile?.evidenceStats;

  return (
    <div className="flex h-screen max-h-screen bg-background text-foreground font-sans">
      <div className="flex flex-col flex-1 min-w-0">
        <AppHeader
          badge="DNA"
          navLinks={[
            { href: "/", label: "Chat" },
            { href: "/activity", label: "Activity" },
            { href: "/review", label: "Review a PR" },
          ]}
        />

        {!isAuthLoading && !isAuthenticated && (
          <div className="flex-none px-6 py-3 bg-primary/5 border-b border-primary/10 text-center text-sm text-muted-foreground">
            <span className="text-primary font-medium">Sign in with GitHub</span> to build your
            evidence-backed engineering profile.
          </div>
        )}

        <ScrollArea className="flex-1 w-full">
          <div className="max-w-3xl mx-auto py-8 px-4 md:px-0 flex flex-col gap-6">
            <div>
              <div className="flex items-center gap-2">
                <Dna className="h-6 w-6 text-primary" />
                <h2 className="text-2xl font-semibold tracking-tight">Developer DNA</h2>
              </div>
              <p className="mt-2 text-sm text-muted-foreground max-w-xl">
                An engineering profile grounded in your public GitHub pushes, PRs, code changes,
                and DevMind reviews — with confidence levels and links to evidence. No invented
                scores.
              </p>
            </div>

            {isAuthenticated && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => void rebuild()}
                  disabled={isRebuilding}
                >
                  {isRebuilding ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Rebuild profile
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void load()}
                  disabled={isLoading || isRebuilding}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Refresh
                </Button>
                <Button variant="outline" size="sm" onClick={loginWithGitHub}>
                  Reconnect GitHub
                </Button>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {profile && (
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-muted-foreground">
                <span className="rounded-md border border-border/50 bg-secondary/40 px-2 py-1">
                  {statusLabel(profile.status)}
                </span>
                {profile.analyzedAt && (
                  <span>
                    Analyzed {new Date(profile.analyzedAt).toLocaleString()}
                  </span>
                )}
              </div>
            )}

            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ["Pushes", stats.pushCount],
                  ["PRs", stats.prCount],
                  ["Reviews", stats.reviewCount],
                  ["Diffs", stats.diffCount],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-xl border border-border/40 bg-card/30 px-3 py-3"
                  >
                    <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
                  </div>
                ))}
              </div>
            )}

            {profile?.summary && (
              <div className="rounded-xl border border-border/60 bg-card/50 px-4 py-4">
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
                  Profile summary
                </p>
                <ChatMarkdown content={profile.summary} />
              </div>
            )}

            {profile?.status === "insufficient_data" && (
              <div className="rounded-xl border border-dashed border-border/60 px-6 py-8 text-center text-sm text-muted-foreground">
                <ShieldAlert className="mx-auto mb-3 h-8 w-8 opacity-60" />
                <p>
                  Not enough public evidence yet. Sync Activity after signing in with GitHub, or wait
                  for linked PR reviews, then rebuild.
                </p>
              </div>
            )}

            {!isAuthLoading && isAuthenticated && !profile && !isLoading && !isRebuilding && (
              <div className="rounded-xl border border-dashed border-border/60 px-6 py-10 text-center text-sm text-muted-foreground">
                No profile yet. Click <span className="text-foreground font-medium">Rebuild profile</span>{" "}
                to analyze your public engineering evidence.
              </div>
            )}

            {insightsByKind.map((group) => (
              <section key={group.kind} className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold tracking-tight">{group.label}</h3>
                <ul className="flex flex-col gap-3">
                  {group.items.map((insight) => (
                    <InsightCard key={insight.id} insight={insight} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
