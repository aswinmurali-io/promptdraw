import { describe, expect, it } from "vitest";
import { fuzzyScore } from "./fuzzy";

describe("fuzzyScore", () => {
  it("matches subsequences and ranks direct and word-start hits higher", () => {
    expect(fuzzyScore("cpy", "Copy prompt")).not.toBeNull();
    expect(fuzzyScore("xyz", "Copy prompt")).toBeNull();
    expect(fuzzyScore("", "anything")).toBe(0);
    expect(fuzzyScore("copy", "Copy prompt")!).toBeGreaterThan(fuzzyScore("cpy", "Copy prompt")!);
    expect(fuzzyScore("prompt", "Copy prompt")!).toBeGreaterThan(fuzzyScore("rompt", "Copy prompt")!);
  });
});
