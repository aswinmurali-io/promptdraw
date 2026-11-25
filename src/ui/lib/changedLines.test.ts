import { describe, expect, it } from "vitest";
import { changedLines } from "./changedLines";

const base = ["## Task", "", "Fix it", "", "## Workspace", "", "- branch", "- commit"].join("\n");

describe("changedLines", () => {
  it("finds a section added in the middle, without its blank spacing", () => {
    const next = base.replace("## Workspace", "## How to work\n\n- Tests matter\n\n## Workspace");
    expect(changedLines(base, next)).toEqual([4, 7]);
  });

  it("finds an edited line", () => {
    expect(changedLines(base, base.replace("Fix it", "Fix it now"))).toEqual([2, 3]);
  });

  it("is null for no change, a pure removal or a near-total rewrite", () => {
    expect(changedLines(base, base)).toBeNull();
    expect(changedLines(base, base.replace("\n- commit", ""))).toBeNull();
    expect(changedLines(base, "## Workflow\n\nGoal\n\n1. a\n2. b\n3. c\n4. d")).toBeNull();
  });
});
