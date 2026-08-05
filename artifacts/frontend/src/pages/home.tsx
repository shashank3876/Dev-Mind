import React, { useRef, useEffect, useState } from "react";
import { useChat } from "@/hooks/use-chat";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Link } from "wouter";
import { Send, Terminal, Moon, Sun, Loader2 } from "lucide-react";
import { AuthControls } from "@/components/auth-controls";

export default function Home() {
  const { messages, sendMessage, isLoading } = useChat();
  const { theme, setTheme } = useTheme();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-screen max-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
      {/* Header */}
      <header className="flex-none flex items-center justify-between px-6 py-4 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground shadow-sm">
            <Terminal className="w-4 h-4" />
          </div>
          <h1 className="font-semibold tracking-tight text-lg">DevMind</h1>
          <span className="px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-[10px] font-mono font-medium tracking-wider uppercase ml-2 border border-border/50">Beta</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/review">
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              Review a PR
            </Button>
          </Link>
          <AuthControls />
          <Button
            variant="ghost" 
            size="icon" 
            className="text-muted-foreground hover:text-foreground h-9 w-9 rounded-full"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            data-testid="button-toggle-theme"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
      </header>

      {/* Chat Area */}
      <ScrollArea className="flex-1 w-full px-4 md:px-0">
        <div className="max-w-3xl mx-auto py-8 flex flex-col gap-6 md:gap-8 min-h-full">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-500 mt-20">
              <div className="w-16 h-16 rounded-2xl bg-secondary/50 flex items-center justify-center mb-6 ring-1 ring-border/50 shadow-sm">
                <Terminal className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">How can I help you build?</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Paste your code, ask for architectural advice, or debug a tricky error. DevMind is ready.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-12 w-full max-w-lg">
                {[
                  "Review my React component for performance issues",
                  "Explain how React Server Components work",
                  "Write a regex to match valid email addresses",
                  "Optimize my Drizzle database query"
                ].map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(prompt); }}
                    className="text-left px-4 py-3 rounded-lg border border-border/50 bg-secondary/20 hover:bg-secondary/60 hover:border-primary/30 transition-all text-sm text-muted-foreground hover:text-foreground active:scale-[0.98]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex gap-4 ${msg.role === "assistant" ? "pr-4 md:pr-12" : "pl-4 md:pl-12 justify-end"} animate-in slide-in-from-bottom-2 fade-in duration-300`}
                data-testid={`message-${msg.role}`}
              >
                {msg.role === "assistant" && (
                  <Avatar className="w-8 h-8 border border-border/50 shadow-sm shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">DM</AvatarFallback>
                  </Avatar>
                )}
                <div 
                  className={`relative flex flex-col gap-1 ${
                    msg.role === "assistant" 
                      ? "items-start w-full" 
                      : "items-end max-w-[85%]"
                  }`}
                >
                  <div 
                    className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "user" 
                        ? "bg-primary text-primary-foreground rounded-tr-sm shadow-sm" 
                        : "bg-secondary/40 border border-border/50 text-foreground rounded-tl-sm whitespace-pre-wrap font-mono text-[13px]"
                    }`}
                  >
                    {msg.content}
                    {msg.isStreaming && (
                      <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-primary animate-pulse" />
                    )}
                  </div>
                </div>
                {msg.role === "user" && (
                  <Avatar className="w-8 h-8 border border-border/50 shadow-sm shrink-0">
                    <AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-medium">ME</AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="flex-none p-4 md:p-6 bg-gradient-to-t from-background via-background to-transparent z-10">
        <div className="max-w-3xl mx-auto relative">
          <form 
            onSubmit={handleSubmit}
            className="relative flex items-end gap-2 bg-card rounded-xl border border-border/50 shadow-sm ring-1 ring-black/5 dark:ring-white/5 focus-within:ring-primary/50 focus-within:border-primary/50 transition-all duration-200"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask DevMind anything..."
              className="min-h-[60px] w-full resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-4 py-4 text-sm scrollbar-thin max-h-48"
              disabled={isLoading && !messages[messages.length - 1]?.isStreaming}
              data-testid="input-message"
            />
            <div className="p-2 shrink-0">
              <Button 
                type="submit" 
                size="icon" 
                className={`rounded-lg w-10 h-10 transition-all duration-200 ${
                  input.trim() 
                    ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm" 
                    : "bg-secondary text-muted-foreground hover:bg-secondary hover:text-muted-foreground opacity-50 cursor-not-allowed"
                }`}
                disabled={!input.trim() || (isLoading && !messages[messages.length - 1]?.isStreaming)}
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
          <div className="text-center mt-3">
            <span className="text-[11px] text-muted-foreground font-medium tracking-wide">
              DevMind can make mistakes. Consider verifying critical information.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
