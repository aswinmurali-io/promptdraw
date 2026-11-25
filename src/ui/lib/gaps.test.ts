import { describe, expect, it } from "vitest";
import { appDefaults, appState, buildPrompt } from "../../core";
import { gapsLabel, promptGaps } from "./gaps";

describe("promptGaps", () => {
  it("finds the compiler's own placeholder for an empty task", () => {
    const [empty] = buildPrompt(appState({ ...appDefaults(), task: "" }));
    expect(promptGaps(empty).map((g) => g.key)).toEqual(["task"]);
    const [filled] = buildPrompt(appState({ ...appDefaults(), task: "ship it" }));
    expect(promptGaps(filled)).toEqual([]);
  });

  it("finds the empty workflow goal on the Stages tab", () => {
    const [p] = buildPrompt(appState({ ...appDefaults(), tab: "stages" }));
    expect(promptGaps(p).map((g) => g.key)).toContain("goal");
  });

  it("names the gaps in a short line", () => {
    expect(gapsLabel([])).toBe("");
    expect(gapsLabel(promptGaps("<describe the task here>"))).toBe("Task is empty");
    expect(gapsLabel(promptGaps("<describe the task here> <describe the goal here>"))).toBe("Task and Goal are empty");
  });

  it("flags a stage whose description is empty without changing the prompt", () => {
    const wf = { goal: "ship", blocks: [
      { id: "b1", type: "stage", name: "", prompt: "" },
      { id: "b2", type: "stage", name: "Plan", prompt: "write it — then stop" },
      { id: "b3", type: "stage", name: "Check", prompt: "", model: "opus" },
    ], on_cancel: { stages: [{ name: "", prompt: "" }] } };
    const [p] = buildPrompt(appState({ ...appDefaults(), tab: "stages", workflow: wf as never }));
    expect(p).toContain("1. **Stage 1** — \n");
    const gaps = promptGaps(p).sort((a, b) => a.stage!.localeCompare(b.stage!)); // prompt order puts on-cancel first
    expect(gaps.map((g) => g.stage)).toEqual(["1", "3", "C1"]);
    expect(gaps[0]!.placeholder).toBe("1. **Stage 1** —");
    expect(gaps[2]!.label).toBe("Cancel stage 1");
    expect(gapsLabel(gaps)).toBe("3 stages have no description");
    expect(gapsLabel(gaps.slice(0, 1))).toBe("Stage 1 has no description");
    expect(gapsLabel([...promptGaps("<describe the goal here>"), gaps[1]!])).toBe("Goal and Stage 3's description are empty");
  });
});

describe("empty prompt blocks", () => {
  it("flags a prompt block with no text without changing the prompt", () => {
    const wf = { goal: "ship", blocks: [
      { id: "b1", type: "stage", name: "Plan", prompt: "plan it" },
      { id: "b2", type: "prompt", text: "" },
      { id: "b3", type: "prompt", text: "keep it short" },
    ] };
    const [p] = buildPrompt(appState({ ...appDefaults(), tab: "stages", workflow: wf as never }));
    expect(p).toContain("**Note:** \n");
    expect(p).toContain("**Note:** keep it short");
    const gaps = promptGaps(p);
    expect(gaps.map((g) => g.key)).toEqual(["note"]);
    expect(gaps[0]!.placeholder).toBe("**Note:**");
    expect(gapsLabel(gaps)).toBe("A prompt block is empty");
    expect(gapsLabel([...gaps, ...gaps])).toBe("2 prompt blocks are empty");
    expect(gapsLabel([...promptGaps("<describe the goal here>\n1. **Stage 1** — "), ...gaps])).toBe("Goal, Stage 1's description and a prompt block are empty");
  });
});
