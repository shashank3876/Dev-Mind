import { useState } from "react";
import { ChevronDown, ChevronRight, BookOpen } from "lucide-react";
import type { RagSource } from "@/lib/sse";

type RagSourcesProps = {
  sources: RagSource[];
};

function truncate(text: string, max = 160): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

export function RagSources({ sources }: RagSourcesProps) {
  const [open, setOpen] = useState(false);

  if (sources.length === 0) return null;

  return (
    <div className="mt-2 w-full max-w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-secondary/30 px-2.5 py-1 text-[11px] font-mono text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <BookOpen className="w-3 h-3 text-primary" />
        {sources.length} source{sources.length === 1 ? "" : "s"} used
      </button>

      {open && (
        <div className="mt-2 space-y-2 rounded-xl border border-border/50 bg-secondary/20 p-3">
          {sources.map((source, index) => (
            <div key={index} className="text-xs leading-relaxed">
              <div className="flex items-center gap-2 mb-1">
                {source.source && (
                  <span className="font-mono text-primary/80">{source.source}</span>
                )}
                {source.score != null && (
                  <span className="text-muted-foreground">
                    score {source.score.toFixed(2)}
                  </span>
                )}
              </div>
              <p className="text-muted-foreground whitespace-pre-wrap font-mono text-[11px]">
                {truncate(source.text)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
