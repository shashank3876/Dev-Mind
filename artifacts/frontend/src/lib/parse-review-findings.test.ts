import { describe, expect, it } from "vitest";
import { countSeverities, parseReviewFindings } from "./parse-review-findings";

const sampleReview = `### 1. Missing null check

**Severity:** Critical

**Issue:** The handler can crash when input is null.

**Suggestion:** Add a guard clause.

### 2. Rename variable

**Severity:** Nit

**Issue:** The variable name is unclear.

**Suggestion:** Use a descriptive name.
`;

describe("parseReviewFindings", () => {
  it("parses numbered findings with severity", () => {
    const findings = parseReviewFindings(sampleReview);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      number: 1,
      title: "Missing null check",
      severity: "Critical",
    });
    expect(findings[1].severity).toBe("Nit");
  });

  it("defaults severity when missing", () => {
    const review = `### 1. Some issue

**Issue:** Something broke.

**Suggestion:** Fix it.
`;
    expect(parseReviewFindings(review)[0].severity).toBe("Suggestion");
  });

  it("ignores summary-only reviews", () => {
    const review = `### Summary

No significant issues found.`;
    expect(parseReviewFindings(review)).toHaveLength(0);
  });
});

describe("countSeverities", () => {
  it("counts by severity", () => {
    const counts = countSeverities(parseReviewFindings(sampleReview));
    expect(counts).toEqual({ Critical: 1, Suggestion: 0, Nit: 1 });
  });
});
