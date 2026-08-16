import React, { useRef, useEffect, useState } from "react";
import { ChatQuotaError, useChat } from "@/hooks/use-chat";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AppHeader } from "@/components/app-header";
import { Send, Terminal, Loader2, Sparkles, Code2, Regex, Database } from "lucide-react";
import { UpgradeButton } from "@/components/upgrade-button";
import { useToast } from "@/hooks/use-toast";

function formatResetDate(iso: string): string {
  if (!iso) return "next month";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function Home() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { messages, sendMessage, isLoading, usage, isUsageLoading } = useChat();
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const canSend = isAuthenticated && (usage?.canSend ?? false);
  const inputDisabled =
    !isAuthenticated ||
    !canSend ||
    (isLoading && !messages[messages.length - 1]?.isStreaming);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !canSend) return;
    const text = input.trim();
    setInput("");
    try {
      await sendMessage(text);
    } catch (error) {
      if (error instanceof ChatQuotaError) {
        toast({
          variant: "destructive",
          title: "Monthly limit reached",
          description: `You've used ${error.used}/${error.limit} messages. Resets ${formatResetDate(error.resetsAt)}.`,
        });
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit(e);
    }
  };

  const usageLabel = usage?.isSubscribed
    ? "Pro plan — unlimited chat"
    : usage
      ? `${usage.used}/${usage.limit} messages this month`
      : null;

  return (
    <div className="flex flex-col h-screen max-h-screen bg-background text-foreground font-sans selection:bg-primary/30 relative">
      <AppHeader
        navLinks={[{ href: "/review", label: "Review a PR" }]}
        extra={
          isAuthenticated && usageLabel ? (
            <span className="hidden sm:inline px-2 py-0.5 rounded-full bg-secondary/60 text-muted-foreground text-[10px] font-mono border border-border/50 truncate max-w-[200px]">
              {isUsageLoading ? "Loading usage..." : usageLabel}
            </span>
          ) : undefined
        }
      />

      {!isAuthLoading && !isAuthenticated && (
        <div className="flex-none px-6 py-3 bg-primary/5 border-b border-primary/10 text-center text-sm text-muted-foreground">
          <span className="text-primary font-medium">Sign in</span> to start chatting — free plan includes 5 messages per month.
        </div>
      )}

      {isAuthenticated && usage && !usage.canSend && !usage.isSubscribed && (
        <div className="flex-none px-6 py-3 bg-destructive/10 border-b border-destructive/20 flex flex-col sm:flex-row items-center justify-center gap-3 text-sm">
          <span className="text-destructive">
            Monthly limit reached ({usage.used}/{usage.limit}). Resets {formatResetDate(usage.resetsAt)}.
          </span>
          <UpgradeButton size="sm" />
        </div>
      )}

      <ScrollArea className="flex-1 w-full px-4 md:px-0">
        <div className="max-w-3xl mx-auto py-8 flex flex-col gap-6 md:gap-8 min-h-full">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-500 mt-16 md:mt-20">
              <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center mb-6">
                <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl animate-pulse" />
                <div className="relative w-16 h-16 rounded-2xl bg-secondary/60 flex items-center justify-center ring-1 ring-primary/30">
                  <Terminal className="w-8 h-8 text-primary" />
                </div>
              </div>
              <h2 className="text-2xl font-semibold mb-2 tracking-tight">How can I help you build?</h2>
              <p className="text-muted-foreground max-w-md mx-auto text-sm leading-relaxed">
                Paste your code, ask for architectural advice, or debug a tricky error.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-10 w-full max-w-lg">
                {[
                  { text: "Review my React component for performance issues", icon: Sparkles },
                  { text: "Explain how React Server Components work", icon: Code2 },
                  { text: "Write a regex to match valid email addresses", icon: Regex },
                  { text: "Optimize my Drizzle database query", icon: Database },
                ].map(({ text, icon: Icon }, i) => (
                  <button
                    key={i}
                    onClick={() => { if (canSend) setInput(text); }}
                    disabled={!canSend}
                    className="group text-left px-4 py-3.5 rounded-xl border border-border/50 bg-secondary/20 hover:bg-secondary/50 hover:border-primary/40 hover:shadow-[0_4px_16px_hsl(var(--primary)/0.08)] transition-all duration-200 text-sm text-muted-foreground hover:text-foreground active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-start gap-3"
                  >
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <Icon className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="leading-snug pt-0.5">{text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 md:gap-4 ${msg.role === "assistant" ? "pr-2 md:pr-12" : "pl-2 md:pl-12 justify-end"} animate-in slide-in-from-bottom-2 fade-in duration-300`}
                data-testid={`message-${msg.role}`}
              >
                {msg.role === "assistant" && (
                  <Avatar className="w-8 h-8 border border-border/50 shadow-sm shrink-0 mt-5">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
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
                  <span className={`text-[10px] font-mono uppercase tracking-wider text-muted-foreground px-1 ${msg.role === "user" ? "text-right" : ""}`}>
                    {msg.role === "assistant" ? "DevMind" : "You"}
                  </span>
                  <div
                    className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-sm shadow-[0_2px_12px_hsl(var(--primary)/0.25)]"
                        : "bg-card border border-border/60 text-foreground rounded-tl-sm whitespace-pre-wrap font-mono text-[13px] shadow-sm"
                    }`}
                  >
                    {msg.content}
                    {msg.isStreaming && (
                      <span className="streaming-cursor" aria-hidden="true" />
                    )}
                  </div>
                </div>
                {msg.role === "user" && (
                  <Avatar className="w-8 h-8 border border-border/50 shadow-sm shrink-0 mt-5">
                    <AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-medium">
                      ME
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="flex-none p-4 md:p-6 bg-gradient-to-t from-background via-background/95 to-transparent z-10 border-t border-border/20">
        <div className="max-w-3xl mx-auto relative">
          <form
            onSubmit={handleSubmit}
            className="relative flex items-end gap-2 bg-card/80 backdrop-blur-sm rounded-2xl border border-border/60 shadow-md ring-1 ring-black/5 dark:ring-white/5 focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary/50 focus-within:shadow-[0_0_20px_hsl(var(--primary)/0.1)] transition-all duration-200"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                !isAuthenticated
                  ? "Sign in to chat..."
                  : !canSend
                    ? "Monthly limit reached — upgrade to continue"
                    : "Ask DevMind anything..."
              }
              className="min-h-[60px] w-full resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-4 py-4 text-sm scrollbar-thin max-h-48"
              disabled={inputDisabled}
              data-testid="input-message"
            />
            <div className="p-2 shrink-0">
              <Button
                type="submit"
                size="icon"
                className={`rounded-xl w-10 h-10 transition-all duration-200 ${
                  input.trim() && canSend
                    ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_2px_8px_hsl(var(--primary)/0.35)]"
                    : "bg-secondary text-muted-foreground hover:bg-secondary hover:text-muted-foreground opacity-50 cursor-not-allowed"
                }`}
                disabled={!input.trim() || inputDisabled}
                data-testid="button-send"
              >
                {isLoading && !messages[messages.length - 1]?.isStreaming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span className="sr-only">Send message</span>
              </Button>
            </div>
          </form>
          <div className="text-center mt-3 space-y-1">
            {isAuthenticated && usage && !usage.isSubscribed && (
              <p className="text-[11px] text-muted-foreground font-medium tracking-wide sm:hidden">
                {isUsageLoading ? "Loading usage..." : usageLabel}
              </p>
            )}
            <span className="text-[11px] text-muted-foreground font-medium tracking-wide">
              Press <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border/60 font-mono text-[10px]">Enter</kbd> to send ·{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border/60 font-mono text-[10px]">Shift+Enter</kbd> for new line
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
