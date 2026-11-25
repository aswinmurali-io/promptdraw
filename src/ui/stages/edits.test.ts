// The stage editor's model mutations: each mirrors a the Python app StageBuilder callback, so the
// compiled prompt after an edit must equal the one the Python app would build.
import { describe, expect, it } from "vitest";
import { PyFloat, TEMPLATES, Workflow, appDefaults, appState, buildPrompt, toYaml, workflowPrompt, type WorkflowDict } from "../../core";
import { flow, sample, withFunctions } from "../../test/fixtures";
import {
  addCancelStage,
  appendUse,
  canMove,
  dropBlock,
  fnNameOk,
  insertBlock,
  makeLoop,
  makePar,
  moveBlock,
  moveCancelStage,
  pruneSelection,
  removeBlock,
  removeLoop,
  resetTemplate,
  selectionHint,
  setBlockField,
  setCallArg,
  setGrace,
  setIntentions,
  setJoin,
  setLoopNumber,
  setModel,
  setName,
  setParams,
  templateEdited,
  ungroup,
} from "./edits";

const S = (): WorkflowDict => sample().toDict();
const W = (d: WorkflowDict) => new Workflow(d);
const task = appState(appDefaults());

describe("insert", () => {
  it("at a gap inside a loop joins that loop", () => {
    const d = S();
    const { wf, id } = insertBlock(d, { at: W(d).idx("b6"), loop: "l1" }, "stage", null, task);
    expect(W(wf).loop("l1")?.blocks).toEqual(["b5", id, "b6"]);
  });

  it("after the focused block lands after its parallel group, outside it", () => {
    const { wf, id } = insertBlock(S(), { after: { kind: "block", id: "b1" } }, "prompt", null, task);
    expect(W(wf).ids()[2]).toBe(id);
    expect(W(wf).parOf(id)).toBeNull();
  });

  it("a branch tile adds a stage to the group", () => {
    const { wf, id } = insertBlock(S(), { par: "p1" }, "stage", "recon", task);
    expect(W(wf).par("p1")?.blocks).toEqual(["b1", "b2", id]);
    expect(W(wf).block(id)?.name).toBe(TEMPLATES.recon.name);
  });

  it("a new intentions block starts from the Task tab's toggles; a second insert reuses it", () => {
    const cfg = { ...appDefaults(), toggles: { ...appDefaults().toggles, tests: true, workers: true }, worker_model: "sonnet" as const };
    const { wf, id } = insertBlock(S(), {}, "intentions", null, appState(cfg));
    const b = W(wf).block(id);
    expect(b?.toggles).toEqual(["workers", "tests"]);
    expect(b?.worker_model).toBe("sonnet");
    const again = insertBlock(wf, {}, "intentions", null, task);
    expect(again.id).toBe(id);
    expect(W(again.wf).block(id)?.toggles).toEqual(["workers", "tests"]);
  });

  it("functions never join a loop", () => {
    const d = S();
    const { wf, id } = insertBlock(d, { at: W(d).idx("b7"), loop: "l1" }, "function", null, task);
    expect(W(wf).loops.some((l) => l.blocks.includes(id))).toBe(false);
    expect(W(wf).block(id)?.name).toBe("New function 1");
  });
});

describe("structure", () => {
  it("remove dissolves a one-branch parallel group", () => {
    const wf = removeBlock(S(), "b2");
    expect(W(wf).parallels).toEqual([]);
  });

  it("move swaps whole units and respects canMove", () => {
    expect(canMove(S(), "b4", -1)).toBe(true);
    expect(flow(W(moveBlock(S(), "b4", -1)))).toBe("b1∥b2 → b4 → b3 → [b5 → b6] → b7");
    expect(canMove(S(), "b5", -1)).toBe(false);
    expect(flow(W(moveBlock(S(), "b2", -1)))).toBe("b2∥b1 → b3 → b4 → [b5 → b6] → b7");
  });

  it("drops onto a gap or a parallel frame; a note is refused by the frame", () => {
    const d = S();
    const gap = dropBlock(d, "b7", { kind: "link", at: 0, loop: null });
    expect(gap.ok).toBe(true);
    expect(W(gap.wf).ids()[0]).toBe("b7");
    const par = dropBlock(d, "b4", { kind: "branch", par: "p1" });
    expect(W(par.wf).par("p1")?.blocks).toEqual(["b1", "b2", "b4"]);
    const note = dropBlock(d, "b3", { kind: "branch", par: "p1" });
    expect(note.ok).toBe(false);
    expect(note.wf).toEqual(d);
  });

  it("loop / parallel from the selection, with the toolbar hint", () => {
    const d = S();
    expect(selectionHint(d, [])).toMatch(/^Click a block to edit it/);
    expect(selectionHint(d, ["b6", "b4", "b5"])).toBe("3 stages selected · press L to loop");
    expect(selectionHint(d, ["b1"])).toBe("1 stage selected · Select every branch of a parallel group to loop it.");
    expect(selectionHint(d, ["b4", "b7"])).toMatch(/^2 \w+( \w+)? selected · Parallel stages must sit next to each other\.$/);
    expect(makeLoop(d, ["b4", "b7"]).id).toBeNull();
    const outer = makeLoop(d, ["b6", "b4", "b5"]);
    expect(W(outer.wf).loop(outer.id as string)?.blocks).toEqual(["b4", "b5", "b6"]);
    const par = makePar(d, ["b7", "b6"]);
    expect(par.id).toBeNull();
    const ok = makePar(removeBlock(d, "b3"), ["b4", "b2"]);
    expect(ok.id).toBeNull();
    const two = makePar(moveBlock(d, "b7", 0), ["b4"]);
    expect(two.id).toBeNull();
    expect(selectionHint(d, ["b4"])).toBe("1 stage selected · press L to loop · tick another to run them in parallel");
  });

  it("remove loop / ungroup report the first block for focus", () => {
    const rl = removeLoop(S(), "l1");
    expect(rl.first).toBe("b5");
    expect(W(rl.wf).loops).toEqual([]);
    const ug = ungroup(S(), "p1");
    expect(ug.first).toBe("b1");
    expect(W(ug.wf).parallels).toEqual([]);
  });

  it("prunes focus and selection that no longer exist", () => {
    const d = removeBlock(S(), "b4");
    expect(pruneSelection(d, { focus: { kind: "block", id: "b4" }, sel: ["b4", "b5"] })).toEqual({ focus: null, sel: ["b5"] });
    const keep = { focus: { kind: "goal" as const }, sel: ["b5"] };
    expect(pruneSelection(d, keep)).toBe(keep);
  });
});

describe("fields", () => {
  it("name is slugified, models set and cleared", () => {
    expect(setName(S(), "My Flow!").name).toBe("my_flow");
    let d = setModel(S(), { block: "b4" }, "sonnet");
    expect(workflowPrompt(W(d))).toContain("2. **Implement** (run on the `sonnet` model, in a subagent if needed) — build it");
    d = setModel(d, { block: "b4" }, "none");
    expect(W(d).block("b4")).not.toHaveProperty("model");
  });

  it("read-only flows into the prompt", () => {
    const d = setBlockField(S(), "b4", "read_only", true);
    expect(workflowPrompt(W(d))).toContain("**Implement** **[READ-ONLY]**");
  });

  it("template edited / reset", () => {
    const d = S();
    expect(templateEdited(W(d).block("b1")!)).toBe(true); // name "Recon" but prompt "map it"
    const r = resetTemplate(d, "b1");
    expect(W(r).block("b1")?.prompt).toBe(TEMPLATES.recon.prompt);
    expect(templateEdited(W(r).block("b1")!)).toBe(false);
    expect(templateEdited(W(d).block("b4")!)).toBeNull();
  });

  it("function name validator and params", () => {
    expect(fnNameOk("Critique take_2-x")).toBe(true);
    expect(fnNameOk("bad!")).toBe(false);
    expect(fnNameOk("x".repeat(41))).toBe(false);
    const d = setParams(withFunctions().toDict(), "b1", " take, , focus ,");
    expect(W(d).block("b1")?.params).toEqual(["take", "focus"]);
  });

  it("uses panel fills a blank by rewriting the call", () => {
    const d = setCallArg(withFunctions().toDict(), "b3", 0, "focus", " pacing, colour ");
    expect(W(d).block("b3")?.prompt).toBe('Then [[Critique: take = B, focus = "pacing, colour"]] now.');
  });

  it("appends a use of a function with empty blanks", () => {
    const d = appendUse(withFunctions().toDict(), "b4", "b1");
    expect(W(d).block("b4")?.text).toBe("Notes may use [[CRITIQUE: take = C, focus = all]] too.\n[[Critique: take = , focus = ]]");
  });

  it("intentions edits go through block_settings and reach the prompt", () => {
    const { wf, id } = insertBlock(S(), {}, "intentions", null, task);
    const d = setIntentions(wf, id, { toggles: { workers: true, progress: true }, worker_model: "sonnet", progress_minutes: "15", progress_format: "json" });
    const b = W(d).block(id);
    expect(b?.progress_minutes).toBe(15);
    const [prompt, sections] = buildPrompt({ ...appState(appDefaults()), tab: "stages", workflow: d });
    expect(prompt).toContain("Run every worker with the `sonnet` model.");
    expect(prompt).toContain("Every 15 minutes");
    expect(sections).toContain("how to work +2");
  });

  it("loop numbers follow the Python app _num: ints > 0, target a float ≥ 0", () => {
    let d = setLoopNumber(S(), "l1", "count", "0");
    expect(W(d).loop("l1")?.count).toBe(3);
    d = setLoopNumber(d, "l1", "count", "5");
    expect(W(d).loop("l1")?.count).toBe(5);
    d = setLoopNumber(d, "l1", "target", "98.5");
    expect(W(d).loop("l1")?.target).toBeInstanceOf(PyFloat);
    expect(workflowPrompt(W(d))).toContain("≥ 98.5");
    d = setLoopNumber(d, "l1", "target", "abc");
    expect(String(W(d).loop("l1")?.target)).toBe("98.5");
    d = setLoopNumber(d, "l1", "target", "90");
    expect(toYaml(W(d))).toContain("    target: 90\n");
  });

  it("join flows into the parallel head line", () => {
    const d = setJoin(S(), "p1", "first");
    expect(workflowPrompt(W(d))).toContain("Move on as soon as the first branch finishes");
  });
});

describe("on cancel", () => {
  it("add, move, grace", () => {
    const first = addCancelStage(S());
    expect(first.i).toBe(0);
    let wf = first.wf;
    wf = addCancelStage(wf).wf;
    const m = moveCancelStage(wf, 0, 5);
    expect(m.i).toBe(1);
    expect(setGrace(wf, "0").on_cancel.grace_minutes).toBe(10);
    expect(setGrace(wf, "4").on_cancel.grace_minutes).toBe(4);
    expect(workflowPrompt(W(setGrace(wf, "4")))).toContain("not finished within 4 minutes");
  });
});
