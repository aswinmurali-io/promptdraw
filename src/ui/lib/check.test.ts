// @lat: [[ui#Workflow links#Check mode]]
import { describe, expect, it } from "vitest";
import { toYaml, Workflow } from "../../core";
import { starterWorkflow } from "../stages/starters";
import { checkWorkflow, reportText } from "./check";

const sprint = () => toYaml(new Workflow(starterWorkflow("sprint-chaser")!));

describe("checkWorkflow", () => {
  // @lat: [[ui#Tests#Check report passes a canonical workflow]]
  it("passes a canonical workflow", () => {
    const r = checkWorkflow(sprint());
    expect(r).toMatchObject({ ok: true, name: "sprint-chaser", identical: true, warnings: [], pass: true });
    if (!r.ok) throw new Error("unreachable");
    expect(r.blocks).toBeGreaterThan(0);
    expect(r.loops).toBe(2);
    const text = reportText(r);
    expect(text.startsWith("Workflow check: PASS")).toBe(true);
    expect(text).toContain("Warnings: none");
    expect(text).toContain("Round trip: identical");
  });

  // @lat: [[ui#Tests#Check report catches misspelled keys]]
  it("fails a misspelled key through the round trip", () => {
    const text = sprint().replace("    name: Pull the backlog\n", "    name: Pull the backlog\n    promt: x\n");
    const r = checkWorkflow(text);
    if (!r.ok) throw new Error("expected a parse");
    expect(r.identical).toBe(false);
    expect(r.pass).toBe(false);
    expect(r.diff[0]?.yours).toContain("promt");
    expect(reportText(r)).toContain("Round trip: the app would rewrite this file");
  });

  it("fails a workflow with load warnings", () => {
    const text = sprint().replace("    model: sonnet\n    read_only: true\n", "    model: gpt4\n    read_only: true\n");
    const r = checkWorkflow(text);
    if (!r.ok) throw new Error("expected a parse");
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.pass).toBe(false);
    expect(reportText(r)).toContain("Warnings:");
  });

  it("reports a parse error", () => {
    const r = checkWorkflow("name: w\ngoal Ship it\n");
    expect(r.ok).toBe(false);
    const text = reportText(r);
    expect(text.startsWith("Workflow check: FAIL")).toBe(true);
    expect(text).toContain("Couldn't load workflow:");
  });
});
