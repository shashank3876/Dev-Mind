import { useState, useCallback } from "react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(async (content: string) => {
    const userMsg: Message = { id: Date.now().toString(), role: "user", content };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    const assistantMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantMsgId, role: "assistant", content: "", isStreaming: true }]);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || "";
      const response = await fetch(`${apiUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, user_id: "user-1" }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      
      let fullAssistantContent = "";

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const token = line.slice(6);
              // Handle escaped newlines or literal tokens as needed, assume plain text tokens
              fullAssistantContent += token.replace(/\\n/g, '\n');
              setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: fullAssistantContent } : m));
            }
          }
        }
      }
      
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, isStreaming: false } : m));
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, isStreaming: false, content: m.content + "\n\n[Error: Connection failed]" } : m));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { messages, sendMessage, isLoading };
}
