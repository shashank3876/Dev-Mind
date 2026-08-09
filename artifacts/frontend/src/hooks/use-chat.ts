import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetChatUsageQueryKey,
  useGetChatUsage,
} from "@workspace/api-client-react";
import { readSseStream } from "@/lib/sse";
import { useAuth } from "@/hooks/use-auth";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export class ChatQuotaError extends Error {
  readonly used: number;
  readonly limit: number;
  readonly resetsAt: string;

  constructor(used: number, limit: number, resetsAt: string) {
    super("Monthly chat limit reached.");
    this.name = "ChatQuotaError";
    this.used = used;
    this.limit = limit;
    this.resetsAt = resetsAt;
  }
}

export function useChat() {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { data: usage, refetch: refetchUsage, isLoading: isUsageLoading } = useGetChatUsage({
    query: {
      queryKey: getGetChatUsageQueryKey(),
      enabled: isAuthenticated,
      retry: false,
      refetchOnWindowFocus: true,
    },
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(
    async (content: string) => {
      const userMsg: Message = { id: Date.now().toString(), role: "user", content };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      const assistantMsgId = (Date.now() + 1).toString();
      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: "assistant", content: "", isStreaming: true },
      ]);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ message: content }),
        });

        if (response.status === 402) {
          const data = (await response.json()) as {
            used?: number;
            limit?: number;
            resetsAt?: string;
          };
          throw new ChatQuotaError(
            data.used ?? usage?.used ?? 0,
            data.limit ?? usage?.limit ?? 0,
            data.resetsAt ?? usage?.resetsAt ?? "",
          );
        }

        if (response.status === 401) {
          throw new Error("Please sign in to send messages.");
        }

        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        if (!response.body) throw new Error("No response body");

        let fullAssistantContent = "";
        for await (const token of readSseStream(response.body)) {
          if (token === "[DONE]") continue;
          if (token.startsWith("[CONTEXT:") || token.startsWith("[PROVIDER:")) continue;
          fullAssistantContent += token;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, content: fullAssistantContent } : m,
            ),
          );
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, isStreaming: false } : m,
          ),
        );

        await refetchUsage();
        queryClient.invalidateQueries({ queryKey: getGetChatUsageQueryKey() });
      } catch (error) {
        if (error instanceof ChatQuotaError) {
          setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId));
          throw error;
        }

        console.error("Chat error:", error);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  isStreaming: false,
                  content:
                    m.content +
                    `\n\n[Error: ${error instanceof Error ? error.message : "Connection failed"}]`,
                }
              : m,
          ),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [queryClient, refetchUsage, usage?.limit, usage?.resetsAt, usage?.used],
  );

  return {
    messages,
    sendMessage,
    isLoading,
    usage: usage ?? null,
    isUsageLoading: isAuthenticated && isUsageLoading,
  };
}
