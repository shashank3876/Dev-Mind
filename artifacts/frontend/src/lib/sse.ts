/** Read an SSE response body, yielding each decoded `data:` payload. */
export async function* readSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6);
        try {
          yield JSON.parse(raw) as string;
        } catch {
          yield raw.replace(/\\n/g, "\n");
        }
      }
    }
  }
}

export function parseReviewMeta(token: string): { repo: string; prNumber: number } | null {
  if (!token.startsWith("[META:") || !token.endsWith("]")) return null;
  const body = token.slice(6, -1);
  const lastColon = body.lastIndexOf(":");
  if (lastColon <= 0) return null;
  return {
    repo: body.slice(0, lastColon),
    prNumber: Number(body.slice(lastColon + 1)),
  };
}

export interface RagSource {
  text: string;
  source?: string;
  score?: number;
}

export function parseRagSources(token: string): RagSource[] | null {
  if (!token.startsWith("[SOURCES:") || !token.endsWith("]")) return null;
  try {
    const parsed = JSON.parse(token.slice(9, -1)) as RagSource[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
