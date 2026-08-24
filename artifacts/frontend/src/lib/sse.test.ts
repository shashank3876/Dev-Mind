import { describe, expect, it } from "vitest";
import { parseRagSources, parseReviewMeta } from "./sse";

describe("parseReviewMeta", () => {
  it("parses valid meta token", () => {
    expect(parseReviewMeta("[META:facebook/react:28939]")).toEqual({
      repo: "facebook/react",
      prNumber: 28939,
    });
  });

  it("returns null for invalid token", () => {
    expect(parseReviewMeta("[META:invalid")).toBeNull();
    expect(parseReviewMeta("hello")).toBeNull();
  });
});

describe("parseRagSources", () => {
  it("parses valid sources token", () => {
    const sources = [{ text: "chunk one", source: "readme", score: 0.91 }];
    const token = `[SOURCES:${JSON.stringify(sources)}]`;
    expect(parseRagSources(token)).toEqual(sources);
  });

  it("returns null for malformed token", () => {
    expect(parseRagSources("[SOURCES:not-json]")).toBeNull();
    expect(parseRagSources("token")).toBeNull();
  });
});
