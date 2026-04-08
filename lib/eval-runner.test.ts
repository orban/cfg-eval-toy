import { describe, it, expect } from "vitest";
import { splitInlineFlags, checkPatterns } from "./eval-runner";

describe("splitInlineFlags", () => {
  it("extracts an (?i) prefix", () => {
    expect(splitInlineFlags("(?i)select")).toEqual(["select", "i"]);
  });

  it("extracts multi-flag (?ims) prefix", () => {
    expect(splitInlineFlags("(?ims)select")).toEqual(["select", "ims"]);
  });

  it("returns the pattern unchanged when no prefix", () => {
    expect(splitInlineFlags("select\\s+sum")).toEqual(["select\\s+sum", ""]);
  });
});

describe("checkPatterns", () => {
  it("applies the inline (?i) flag — regression guard for commit c3b52b9", () => {
    // Before the fix, new RegExp("(?i)SELECT") threw "Invalid group" and the
    // try/catch silently stamped the pattern as failed. This asserts the
    // inline flag actually takes effect.
    const result = checkPatterns("select * from t", { main: "(?i)SELECT" });
    expect(result).toEqual([]);
  });

  it("reports failed patterns by name", () => {
    const result = checkPatterns("SELECT * FROM t", {
      has_select: "SELECT",
      has_group_by: "\\bGROUP BY\\b",
    });
    expect(result).toEqual(["has_group_by"]);
  });

  it("marks malformed patterns as failed without throwing", () => {
    // If the YAML ever ships a broken regex, the eval run should degrade
    // gracefully instead of crashing the whole /api/eval request.
    const result = checkPatterns("select", { broken: "(?i)[unclosed" });
    expect(result).toEqual(["broken"]);
  });

  it("handles patterns with no inline flag", () => {
    const result = checkPatterns("SELECT sum(price) FROM orders", {
      has_sum: "sum\\(price\\)",
    });
    expect(result).toEqual([]);
  });
});
