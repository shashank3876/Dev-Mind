export type ReviewSeverity = "Critical" | "Suggestion" | "Nit";

export interface ReviewFinding {
  number: number;
  title: string;
  severity: ReviewSeverity;
}

const FINDING_HEADER = /^###\s+(\d+)\.\s+(.+)$/m;
const SEVERITY_LINE = /^\*\*Severity:\*\*\s*(Critical|Suggestion|Nit)\s*$/im;

function normalizeSeverity(value: string | undefined): ReviewSeverity {
  const lower = (value ?? "").toLowerCase();
  if (lower === "critical") return "Critical";
  if (lower === "nit") return "Nit";
  return "Suggestion";
}

export function parseReviewFindings(review: string): ReviewFinding[] {
  if (!review.trim()) return [];

  const sections = review.split(/^###\s+/m).slice(1);
  const findings: ReviewFinding[] = [];

  for (const section of sections) {
    const headerMatch = section.match(/^(\d+)\.\s+(.+?)(?:\r?\n|$)/);
    if (!headerMatch) continue;

    const number = Number(headerMatch[1]);
    const title = headerMatch[2].trim();
    if (title.toLowerCase() === "summary") continue;

    const severityMatch = section.match(SEVERITY_LINE);
    findings.push({
      number,
      title,
      severity: normalizeSeverity(severityMatch?.[1]),
    });
  }

  return findings.sort((a, b) => a.number - b.number);
}

export function countSeverities(findings: ReviewFinding[]): Record<ReviewSeverity, number> {
  return findings.reduce(
    (acc, finding) => {
      acc[finding.severity] += 1;
      return acc;
    },
    { Critical: 0, Suggestion: 0, Nit: 0 } as Record<ReviewSeverity, number>,
  );
}

// Exported for tests — validates header regex independently.
export const findingHeaderPattern = FINDING_HEADER;
