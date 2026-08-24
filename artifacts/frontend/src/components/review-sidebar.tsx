import { GitPullRequest, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PrReviewSummary } from "@/hooks/use-pr-reviews";

type ReviewSidebarProps = {
  reviews: PrReviewSummary[];
  activeId: string | null;
  onNewReview: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
};

export function ReviewSidebar({
  reviews,
  activeId,
  onNewReview,
  onSelect,
  onDelete,
}: ReviewSidebarProps) {
  return (
    <aside className="flex w-44 sm:w-56 md:w-64 shrink-0 flex-col border-r border-cyan-500/15 bg-gradient-to-b from-cyan-500/5 via-secondary/20 to-violet-500/5">
      <div className="p-3">
        <Button
          className="w-full justify-start gap-2 border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 hover:text-cyan-100"
          variant="outline"
          onClick={onNewReview}
        >
          <GitPullRequest className="w-4 h-4" />
          New PR
        </Button>
      </div>
      <ScrollArea className="flex-1 px-2 pb-3">
        <div className="flex flex-col gap-1">
          {reviews.length === 0 ? (
            <p className="px-2 py-6 text-xs text-muted-foreground text-center">
              Saved PR reviews will show up here.
            </p>
          ) : (
            reviews.map((item) => (
              <div
                key={item.id}
                className={`group flex items-center gap-1 rounded-lg ${
                  activeId === item.id
                    ? "bg-cyan-500/15 text-cyan-100"
                    : "hover:bg-violet-500/10"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className="flex-1 min-w-0 text-left px-2.5 py-2 text-sm truncate"
                >
                  {item.title}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  onClick={() => onDelete(item.id)}
                  aria-label="Delete PR review"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
