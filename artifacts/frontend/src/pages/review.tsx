import { useEffect, useRef, useState } from "react";
import { usePrReviews } from "@/hooks/use-pr-reviews";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AppHeader } from "@/components/app-header";
import { ReviewSidebar } from "@/components/review-sidebar";
import { ReviewFindingsSummary } from "@/components/review-findings-summary";
import { ChatMarkdown } from "@/components/chat-markdown";
import { Loader2, GitPullRequest, ExternalLink, Send } from "lucide-react";

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
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const {
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
    startNewReview,
    loadReview,
    deleteReview,
    reviewPr,
    askAboutReview,
  } = usePrReviews();
  const [question, setQuestion] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const showEmpty = !review && !error && !isLoading && messages.length === 0;
  const canAsk =
    isAuthenticated && Boolean(activeReviewId) && Boolean(review.trim()) && !isLoading && !isStreaming;
  const askDisabled = !canAsk || isAsking;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, review]);

  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prUrl.trim() || isLoading) return;
    void reviewPr(prUrl.trim());
  };

  const handleAskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || askDisabled) return;
    const text = question.trim();
    setQuestion("");
    await askAboutReview(text);
  };

  const handleAskKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleAskSubmit(e);
    }
  };

  return (
    <div className="flex h-screen max-h-screen bg-background text-foreground font-sans selection:bg-cyan-400/30">
      {isAuthenticated && (
        <ReviewSidebar
          reviews={reviews}
          activeId={activeReviewId}
          onNewReview={startNewReview}
          onSelect={(id) => { void loadReview(id); }}
          onDelete={(id) => { void deleteReview(id); }}
        />
      )}
      <div className="flex flex-col flex-1 min-w-0 relative">
        <AppHeader badge="PR Review" navLinks={[{ href: "/", label: "Chat" }]} />

        {!isAuthLoading && !isAuthenticated && (
          <div className="flex-none px-6 py-3 bg-primary/5 border-b border-primary/10 text-center text-sm text-muted-foreground">
            <span className="text-primary font-medium">Sign in</span> to save PR reviews and ask follow-up questions about them.
          </div>
        )}

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
                  Paste a GitHub pull request URL, then ask questions about that review.
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
                {prUrl && (
                  <a
                    href={prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200"
                  >
                    Open PR
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive animate-in fade-in slide-in-from-top-1 duration-300">
                {error}
              </div>
            )}

            {isLoading && !review && <ReviewSkeleton />}

            {review && (
              <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <ReviewFindingsSummary review={review} />
                <div className="rounded-2xl border border-cyan-500/20 bg-card/80 shadow-[0_4px_20px_hsl(186_100%_41%/0.08)] px-5 py-5">
                  <ChatMarkdown content={review} />
                  {isStreaming && (
                    <span className="streaming-cursor" aria-hidden="true" />
                  )}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 md:gap-4 ${msg.role === "assistant" ? "pr-2 md:pr-12" : "pl-2 md:pl-12 justify-end"} animate-in slide-in-from-bottom-2 fade-in duration-300`}
              >
                {msg.role === "assistant" && (
                  <Avatar className="w-8 h-8 border border-cyan-400/40 shadow-[0_0_12px_hsl(186_100%_41%/0.35)] shrink-0 mt-5">
                    <AvatarFallback className="bg-gradient-to-br from-cyan-400 to-teal-500 text-zinc-950 text-xs font-medium">
                      DM
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={`relative flex flex-col gap-1.5 ${
                    msg.role === "assistant"
                      ? "items-start w-full"
                      : "items-end max-w-[85%]"
                  }`}
                >
                  <span className={`text-[10px] font-mono uppercase tracking-wider px-1 ${msg.role === "user" ? "text-right text-violet-300" : "text-cyan-300"}`}>
                    {msg.role === "assistant" ? "DevMind" : "You"}
                  </span>
                  <div
                    className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white rounded-tr-sm shadow-[0_2px_12px_hsl(280_80%_55%/0.35)]"
                        : "bg-card/80 border border-cyan-500/20 text-foreground rounded-tl-sm shadow-[0_4px_20px_hsl(186_100%_41%/0.08)]"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <ChatMarkdown content={msg.content} />
                    ) : (
                      msg.content
                    )}
                    {msg.isStreaming && (
                      <span className="streaming-cursor" aria-hidden="true" />
                    )}
                  </div>
                </div>
                {msg.role === "user" && (
                  <Avatar className="w-8 h-8 border border-violet-400/40 shadow-sm shrink-0 mt-5">
                    <AvatarFallback className="bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white text-xs font-medium">
                      ME
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="flex-none p-4 md:p-6 bg-gradient-to-t from-background via-background/95 to-transparent border-t border-border/20 space-y-3">
          <form onSubmit={handleReviewSubmit} className="max-w-3xl mx-auto flex gap-2">
            <Input
              value={prUrl}
              onChange={(e) => setPrUrl(e.target.value)}
              placeholder="PR link · https://github.com/owner/repo/pull/123"
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

          <form
            onSubmit={handleAskSubmit}
            className="max-w-3xl mx-auto relative flex items-end gap-2 bg-card/80 backdrop-blur-sm rounded-2xl border border-border/60 shadow-md ring-1 ring-black/5 dark:ring-white/5 focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary/50 focus-within:shadow-[0_0_20px_hsl(var(--primary)/0.1)] transition-all duration-200"
          >
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleAskKeyDown}
              placeholder={
                !isAuthenticated
                  ? "Sign in to ask questions about a saved review..."
                  : !review.trim()
                    ? "Run a PR review first, then ask about it..."
                    : "Ask a question about this PR review..."
              }
              className="min-h-[56px] w-full resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-4 py-3.5 text-sm scrollbar-thin max-h-40"
              disabled={askDisabled}
            />
            <div className="p-2 shrink-0">
              <Button
                type="submit"
                size="icon"
                className={`rounded-xl w-10 h-10 transition-all duration-200 ${
                  question.trim() && canAsk
                    ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_2px_8px_hsl(var(--primary)/0.35)]"
                    : "bg-secondary text-muted-foreground hover:bg-secondary hover:text-muted-foreground opacity-50 cursor-not-allowed"
                }`}
                disabled={!question.trim() || askDisabled}
              >
                {isAsking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span className="sr-only">Ask about this review</span>
              </Button>
            </div>
          </form>
          <p className="text-center text-[11px] text-muted-foreground font-medium tracking-wide">
            Public repos only · Reviews stay in DevMind — nothing is posted to GitHub
          </p>
        </div>
      </div>
    </div>
  );
}
