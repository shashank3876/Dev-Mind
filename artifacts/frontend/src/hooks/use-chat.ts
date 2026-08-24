import { useState, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetChatUsageQueryKey,
  useGetChatUsage,
} from "@workspace/api-client-react";
import { readSseStream, parseRagSources, type RagSource } from "@/lib/sse";
import { useAuth } from "@/hooks/use-auth";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  sources?: RagSource[];
}

export type { RagSource };

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
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
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const refreshConversations = useCallback(async () => {
    if (!isAuthenticated) {
      setConversations([]);
      return;
    }
    const response = await fetch("/api/conversations", { credentials: "include" });
    if (!response.ok) return;
    const data = (await response.json()) as { conversations?: ConversationSummary[] };
    setConversations(data.conversations ?? []);
  }, [isAuthenticated]);

  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  const startNewChat = useCallback(() => {
    setConversationId(null);
    setMessages([]);
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    setIsHistoryLoading(true);
    try {
      const response = await fetch(`/api/conversations/${id}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load conversation");
      const data = (await response.json()) as {
        conversation: ConversationSummary;
        messages: Array<{ id: string; role: "user" | "assistant"; content: string }>;
      };
      setConversationId(data.conversation.id);
      setMessages(
        data.messages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
        })),
      );
    } finally {
      setIsHistoryLoading(false);
    }
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/conversations/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) return;
      if (conversationId === id) {
        startNewChat();
      }
      await refreshConversations();
    },
    [conversationId, refreshConversations, startNewChat],
  );

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
          body: JSON.stringify({
            message: content,
            conversationId: conversationId ?? undefined,
          }),
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

        const createdId = response.headers.get("X-Conversation-Id");
        if (createdId) {
          setConversationId(createdId);
        }

        if (!response.body) throw new Error("No response body");

        let fullAssistantContent = "";
        let ragSources: RagSource[] | undefined;
        for await (const token of readSseStream(response.body)) {
          if (token === "[DONE]") continue;
          if (token.startsWith("[CONTEXT:") || token.startsWith("[PROVIDER:")) continue;
          const sources = parseRagSources(token);
          if (sources) {
            ragSources = sources;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, sources: ragSources } : m,
              ),
            );
            continue;
          }
          fullAssistantContent += token;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, content: fullAssistantContent } : m,
            ),
          );
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, isStreaming: false, sources: ragSources } : m,
          ),
        );

        await refetchUsage();
        queryClient.invalidateQueries({ queryKey: getGetChatUsageQueryKey() });
        await refreshConversations();
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
    [
      conversationId,
      queryClient,
      refetchUsage,
      refreshConversations,
      usage?.limit,
      usage?.resetsAt,
      usage?.used,
    ],
  );

  return {
    messages,
    sendMessage,
    isLoading,
    isHistoryLoading,
    usage: usage ?? null,
    isUsageLoading: isAuthenticated && isUsageLoading,
    conversationId,
    conversations,
    startNewChat,
    loadConversation,
    deleteConversation,
  };
}
