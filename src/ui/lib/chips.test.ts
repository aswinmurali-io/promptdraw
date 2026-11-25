import { describe, expect, it } from "vitest";
import { chipLabel } from "./chips";

describe("chipLabel", () => {
  it("says one step in the singular and leaves every other name alone", () => {
    expect(chipLabel("workflow 1 steps")).toBe("workflow 1 step");
    expect(chipLabel("workflow 2 steps")).toBe("workflow 2 steps");
    expect(chipLabel("workflow 11 steps")).toBe("workflow 11 steps");
    expect(chipLabel("workflow")).toBe("workflow");
    expect(chipLabel("git")).toBe("git");
  });
});
