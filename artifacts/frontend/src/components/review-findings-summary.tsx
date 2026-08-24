import { Badge } from "@/components/ui/badge";
import { countSeverities, parseReviewFindings } from "@/lib/parse-review-findings";

type ReviewFindingsSummaryProps = {
  review: string;
};

const severityStyles = {
  Critical: "border-destructive/40 bg-destructive/10 text-destructive",
  Suggestion: "border-primary/40 bg-primary/10 text-primary",
  Nit: "border-border bg-secondary/40 text-muted-foreground",
} as const;

export function ReviewFindingsSummary({ review }: ReviewFindingsSummaryProps) {
  const findings = parseReviewFindings(review);
  if (findings.length === 0) return null;

  const counts = countSeverities(findings);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(Object.keys(counts) as Array<keyof typeof counts>)
        .filter((severity) => counts[severity] > 0)
        .map((severity) => (
          <Badge
            key={severity}
            variant="outline"
            className={`font-mono text-[11px] ${severityStyles[severity]}`}
          >
            {counts[severity]} {severity}
          </Badge>
        ))}
    </div>
  );
}
