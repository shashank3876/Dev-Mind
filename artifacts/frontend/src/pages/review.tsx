import { useState } from "react";
import { Link } from "wouter";
import { usePrReview } from "@/hooks/use-pr-review";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Terminal, Moon, Sun, Loader2, GitPullRequest } from "lucide-react";
import { AuthControls } from "@/components/auth-controls";

export default function ReviewPage() {
  const { review, meta, error, isLoading, isStreaming, reviewPr } = usePrReview();
  const { theme, setTheme } = useTheme();
  const [prUrl, setPrUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prUrl.trim() || isLoading) return;
    reviewPr(prUrl.trim());
  };

  return (
    <div className="flex flex-col h-screen max-h-screen bg-background text-foreground font-sans">
      <header className="flex-none flex items-center justify-between px-6 py-4 border-b border-border/40 bg-background/95 backdrop-blur z-10">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground shadow-sm">
              <Terminal className="w-4 h-4" />
            </div>
            <h1 className="font-semibold tracking-tight text-lg">DevMind</h1>
          </Link>
          <span className="px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-[10px] font-mono font-medium tracking-wider uppercase border border-border/50">
            PR Review
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              Chat
            </Button>
          </Link>
          <AuthControls />
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground h-9 w-9 rounded-full"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1 w-full">
        <div className="max-w-3xl mx-auto py-8 px-4 md:px-0 flex flex-col gap-6">
          {!review && !error && !isLoading && (
            <div className="flex flex-col items-center text-center mt-12 animate-in fade-in duration-500">
              <div className="w-16 h-16 rounded-2xl bg-secondary/50 flex items-center justify-center mb-6 ring-1 ring-border/50">
                <GitPullRequest className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">Review a public PR</h2>
              <p className="text-muted-foreground max-w-md">
                Paste any public GitHub pull request URL. No installation or login required.
              </p>
            </div>
          )}

          {meta && (
            <p className="text-sm text-muted-foreground font-mono">
              Reviewing {meta.repo} #{meta.prNumber}
            </p>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {review && (
            <div className="rounded-2xl border border-border/50 bg-secondary/40 px-5 py-5 text-sm leading-relaxed whitespace-pre-wrap text-[14px]">
              {review}
              {isStreaming && (
                <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-primary animate-pulse" />
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="flex-none p-4 md:p-6 border-t border-border/40">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-2">
          <Input
            value={prUrl}
            onChange={(e) => setPrUrl(e.target.value)}
            placeholder="https://github.com/owner/repo/pull/123"
            className="font-mono text-sm"
            disabled={isLoading}
          />
          <Button type="submit" disabled={!prUrl.trim() || isLoading} className="shrink-0">
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
        <p className="text-center mt-3 text-[11px] text-muted-foreground">
          Public repos only. Reviews are shown here — nothing is posted to GitHub.
        </p>
      </div>
    </div>
  );
}
