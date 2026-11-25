import { describe, expect, it } from "vitest";
import { Workflow, fromYaml, toYaml, workflowPrompt } from "../../core";
import { STARTERS, starterWorkflow } from "./starters";

describe("starter workflows", () => {
  // @lat: [[stages#Stage editor#Tests#Starters load clean]]
  it.each(STARTERS.map((s) => [s.key]))("%s survives the editor and YAML unchanged, with no problems", (key) => {
    const s = STARTERS.find((t) => t.key === key)!;
    const wf = new Workflow(s.workflow);
    expect(wf.toDict()).toEqual(s.workflow);
    expect(wf.callProblems()).toEqual([]);
    const [back, warnings] = fromYaml(toYaml(wf));
    expect(warnings).toEqual([]);
    expect(back.toDict()).toEqual(s.workflow);
    expect(starterWorkflow(key)).toEqual(s.workflow);

    const text = workflowPrompt(wf);
    expect(text).toContain("as an agentic loop without stopping to ask me");
    expect(text).toContain("**In parallel**");
    expect(text).toContain("### Reusable instructions");
    expect(text).toContain("**On cancel:**");
  });

  it("nests Sprint Chaser's per-ticket fix loop inside the burn-down loop", () => {
    const text = workflowPrompt(new Workflow(starterWorkflow("sprint-chaser")!));
    expect(text).toContain("Stop when `criteria_met` ≥ 100, or after 3 passes");
    expect(text).toContain("Stop when `burn_down` ≥ 90, or after 12 passes");
    expect(text).toContain("This loop is nested inside the loop");
  });
});
