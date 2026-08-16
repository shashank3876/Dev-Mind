import { useState } from "react";
import { usePrReview } from "@/hooks/use-pr-review";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { AppHeader } from "@/components/app-header";
import { Loader2, GitPullRequest, ExternalLink } from "lucide-react";

const EXAMPLE_PRS = [
  { label: "facebook/react", url: "https://github.com/facebook/react/pull/28939" },
  { label: "vercel/next.js", url: "https://github.com/vercel/next.js/pull/68289" },
];

function ReviewSkeleton() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-sm px-5 py-5 space-y-3">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <div className="pt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin text-primary" />
        Analyzing diff...
      </div>
    </div>
  );
}

export default function ReviewPage() {
  const { review, meta, error, isLoading, isStreaming, reviewPr } = usePrReview();
  const [prUrl, setPrUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prUrl.trim() || isLoading) return;
    reviewPr(prUrl.trim());
  };

  const showEmpty = !review && !error && !isLoading;

  return (
    <div className="flex flex-col h-screen max-h-screen bg-background text-foreground font-sans relative">
      <AppHeader badge="PR Review" navLinks={[{ href: "/", label: "Chat" }]} />

      <ScrollArea className="flex-1 w-full">
        <div className="max-w-3xl mx-auto py-8 px-4 md:px-0 flex flex-col gap-6">
          {showEmpty && (
            <div className="flex flex-col items-center text-center mt-12 md:mt-16 animate-in fade-in duration-500">
              <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center mb-6">
                <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl animate-pulse" />
                <div className="relative w-16 h-16 rounded-2xl bg-secondary/60 flex items-center justify-center ring-1 ring-primary/30">
                  <GitPullRequest className="w-8 h-8 text-primary" />
                </div>
              </div>
              <h2 className="text-2xl font-semibold mb-2 tracking-tight">Review a public PR</h2>
              <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
                Paste any public GitHub pull request URL. No installation or login required.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2 mt-8">
                <span className="text-xs text-muted-foreground w-full mb-1">Try an example:</span>
                {EXAMPLE_PRS.map(({ label, url }) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setPrUrl(url)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono border border-border/50 bg-secondary/30 hover:bg-secondary/60 hover:border-primary/40 transition-all duration-200 text-muted-foreground hover:text-foreground"
                  >
                    {label}
                    <ExternalLink className="w-3 h-3 opacity-50" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {meta && (
            <div className="flex items-center gap-2 text-sm">
              <GitPullRequest className="w-4 h-4 text-primary shrink-0" />
              <span className="text-muted-foreground">
                Reviewing{" "}
                <span className="font-mono text-foreground">{meta.repo}</span>
                <span className="text-primary font-medium"> #{meta.prNumber}</span>
              </span>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive animate-in fade-in slide-in-from-top-1 duration-300">
              {error}
            </div>
          )}

          {isLoading && !review && <ReviewSkeleton />}

          {review && (
            <div className="rounded-2xl border border-border/60 bg-card shadow-sm px-5 py-5 text-sm leading-relaxed whitespace-pre-wrap text-[14px] font-mono animate-in fade-in slide-in-from-bottom-2 duration-300">
              {review}
              {isStreaming && (
                <span className="streaming-cursor" aria-hidden="true" />
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="flex-none p-4 md:p-6 bg-gradient-to-t from-background via-background/95 to-transparent border-t border-border/20">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-2">
          <Input
            value={prUrl}
            onChange={(e) => setPrUrl(e.target.value)}
            placeholder="https://github.com/owner/repo/pull/123"
            className="font-mono text-sm rounded-xl h-11 focus-visible:ring-primary/40 focus-visible:shadow-[0_0_16px_hsl(var(--primary)/0.1)]"
            disabled={isLoading}
          />
          <Button
            type="submit"
            disabled={!prUrl.trim() || isLoading}
            className="shrink-0 h-11 px-5 rounded-xl shadow-[0_2px_8px_hsl(var(--primary)/0.25)]"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Reviewing
              </>
            ) : (
              "Review"
            )}
          </Button>
        </form>
        <p className="text-center mt-3 text-[11px] text-muted-foreground font-medium tracking-wide">
          Public repos only · Reviews are shown here — nothing is posted to GitHub
        </p>
      </div>
    </div>
  );
}
