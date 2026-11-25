// Port of the Python app's test_workflow.py: the stage workflow model, prompt section and YAML.
import { describe, expect, it } from "vitest";
import { TEMPLATES } from "./constants";
import { flow, sample, withFunctions } from "../test/fixtures";
import { Workflow, filled, setUse, useText, workflowPrompt, type Block, type Loop } from "./workflow";
import { YamlError, fromYaml, toYaml } from "./yaml";

const loop = (wf: Workflow, id: string) => wf.loop(id) as Loop;
const blk = (wf: Workflow, id: string) => wf.block(id) as Block;

describe("Lookups", () => {
  it("shape", () => expect(flow(sample())).toBe("b1∥b2 → b3 → b4 → [b5 → b6] → b7"));
  it("stage numbers", () => {
    expect(sample().stageNumbers()).toEqual({ b1: "1a", b2: "1b", b4: "2", b5: "3", b6: "4", b7: "5" });
  });
  it("loop summary", () => {
    const wf = sample();
    const lp = loop(wf, "l1");
    expect(wf.loopSummary(lp)).toBe("until pixel_similarity ≥ 97 · max 8");
    lp.mode = "count";
    expect(wf.loopSummary(lp)).toBe("3 passes");
    lp.agentic = false;
    expect(wf.loopSummary(lp)).toBe("ask me after each pass");
    expect(wf.loopSpan(lp)).toBe("Critique → Refine");
  });
});

describe("Edits", () => {
  it("insert blank and template", () => {
    const wf = sample();
    const bid = wf.insert(0, "stage", null, "code_review");
    const b = blk(wf, bid);
    expect([b.name, b.template]).toEqual(["Code review", "code_review"]);
    expect(b.prompt).toBe(TEMPLATES.code_review.prompt);
    expect(wf.ids()[0]).toBe(bid);
    const pid = wf.insert(wf.blocks.length, "prompt");
    expect(wf.block(pid)).toEqual({ id: pid, type: "prompt", text: "" });
  });
  it("new ids unique", () => {
    const wf = sample();
    const a = wf.insert(0, "stage");
    const b = wf.insert(0, "stage");
    expect(new Set(wf.ids()).size).toBe(wf.ids().length);
    expect(a).not.toBe(b);
  });
  it("insert into loop gap", () => {
    const wf = sample();
    const bid = wf.insert(wf.idx("b6"), "stage", "l1");
    expect(loop(wf, "l1").blocks).toEqual(["b5", bid, "b6"]);
  });
  it("insert after focus", () => {
    const wf = sample();
    let bid = wf.insertAfter(["block", "b1"], "stage");
    expect(wf.ids()[2]).toBe(bid);
    expect(wf.parOf(bid)).toBeNull();
    bid = wf.insertAfter(["block", "b5"], "stage");
    expect(loop(wf, "l1").blocks).toContain(bid);
    bid = wf.insertAfter(["loop", "l1"], "stage");
    expect(wf.loopOf(bid)).toBeNull();
    expect(wf.ids().at(-2)).toBe(bid);
    bid = wf.insertAfter(null, "prompt");
    expect(wf.ids().at(-1)).toBe(bid);
  });
  it("add branch inside loop", () => {
    const wf = sample();
    const pid = wf.makePar(["b5", "b6"]) as string;
    const bid = wf.addBranch(pid, "ui_critique");
    expect(wf.par(pid)?.blocks).toEqual(["b5", "b6", bid]);
    expect(loop(wf, "l1").blocks).toEqual(["b5", "b6", bid]);
  });
  it("remove dissolves one-branch group and empty loop", () => {
    const wf = sample();
    wf.remove("b2");
    expect(wf.parallels).toEqual([]);
    wf.remove("b5");
    wf.remove("b6");
    expect(wf.loops).toEqual([]);
    expect(flow(wf)).toBe("b1 → b3 → b4 → b7");
  });
  it("move up down", () => {
    const wf = sample();
    expect(wf.move("b4", 1)).toBe(true);
    expect(flow(wf)).toBe("b1∥b2 → b3 → [b5 → b6] → b4 → b7");
    expect(wf.move("b3", -1)).toBe(true);
    expect(flow(wf)).toBe("b3 → b1∥b2 → [b5 → b6] → b4 → b7");
    expect(wf.move("b5", -1)).toBe(false);
    expect(wf.move("b2", -1)).toBe(true);
    expect(wf.par("p1")?.blocks).toEqual(["b2", "b1"]);
  });
  it("move to gap", () => {
    const wf = sample();
    expect(wf.moveTo("b7", 0)).toBe(true);
    expect(flow(wf)).toBe("b7 → b1∥b2 → b3 → b4 → [b5 → b6]");
  });
  it("move to into and out of loop", () => {
    const wf = sample();
    wf.moveTo("b4", wf.idx("b6"), "l1");
    expect(flow(wf)).toBe("b1∥b2 → b3 → [b5 → b4 → b6] → b7");
    wf.moveTo("b4", wf.blocks.length);
    expect(flow(wf)).toBe("b1∥b2 → b3 → [b5 → b6] → b7 → b4");
  });
  it("move to parallel", () => {
    const wf = sample();
    expect(wf.moveTo("b4", 0, null, "p1")).toBe(true);
    expect(wf.par("p1")?.blocks).toEqual(["b1", "b2", "b4"]);
    expect(wf.moveTo("b3", 0, null, "p1")).toBe(false);
    expect(flow(wf)).toBe("b1∥b2∥b4 → b3 → [b5 → b6] → b7");
  });
  it("move to out of parallel", () => {
    const wf = sample();
    wf.moveTo("b2", wf.blocks.length);
    expect(wf.parallels).toEqual([]);
    expect(flow(wf)).toBe("b1 → b3 → b4 → [b5 → b6] → b7 → b2");
  });
});

describe("Grouping", () => {
  it("loop checks", () => {
    const wf = sample();
    expect(wf.loopCheck([])[0]).toBe(false);
    expect(wf.loopCheck(["b5", "b6"])[1]).toContain("already a loop");
    expect(wf.loopCheck(["b4", "b5"])[1]).toContain("cut across");
    expect(wf.loopCheck(["b5"])[0]).toBe(true);
    expect(wf.loopCheck(["b4", "b5", "b6"])[0]).toBe(true);
    expect(wf.loopCheck(["b3", "b7"])[1]).toContain("next to each other");
    expect(wf.loopCheck(["b1"])[1]).toContain("every branch");
    expect(wf.loopCheck(["b1", "b2", "b3"])[0]).toBe(true);
    expect(wf.loopCheck(["b7"])[0]).toBe(true);
  });
  it("par checks", () => {
    const wf = sample();
    expect(wf.parCheck(["b4"])[1]).toContain("two or more");
    expect(wf.parCheck(["b3", "b4"])[1]).toContain("not prompt blocks");
    expect(wf.parCheck(["b2", "b4"])[1]).toContain("already in a parallel");
    expect(wf.parCheck(["b4", "b5"])[1]).toContain("same loop");
    expect(wf.parCheck(["b5", "b6"])[0]).toBe(true);
  });
  it("make loop over parallel", () => {
    const wf = sample();
    const lid = wf.makeLoop(["b1", "b2"]) as string;
    expect(loop(wf, lid).blocks).toEqual(["b1", "b2"]);
    expect(loop(wf, lid).mode).toBe("count");
    expect(flow(wf)).toBe("[b1∥b2] → b3 → b4 → [b5 → b6] → b7");
  });
  it("make rejects invalid", () => {
    const wf = sample();
    expect(wf.makeLoop(["b1"])).toBeNull();
    expect(wf.makePar(["b3", "b4"])).toBeNull();
  });
  it("sync drops bad groups", () => {
    const wf = new Workflow({
      blocks: [
        { id: "b1", type: "stage", name: "", prompt: "" },
        { id: "b2", type: "prompt", text: "" },
        { id: "b3", type: "stage", name: "", prompt: "" },
      ],
      parallels: [{ id: "p1", blocks: ["b1", "b3"] }],
      loops: [{ id: "l1", blocks: ["b1", "b9"] }],
    });
    expect(wf.parallels).toEqual([]);
    expect(wf.loops[0]?.blocks).toEqual(["b1"]);
  });
});

describe("Nesting", () => {
  const nested = (): [Workflow, string] => {
    const wf = sample();
    const lid = wf.makeLoop(["b4", "b5", "b6"]) as string;
    loop(wf, lid).agentic = false;
    return [wf, lid];
  };
  it("wrap and lookups", () => {
    const [wf, lid] = nested();
    expect(flow(wf)).toBe("b1∥b2 → b3 → [b4 → [b5 → b6]] → b7");
    expect(wf.loopOf("b5")?.id).toBe("l1");
    expect(wf.loopsOf("b5").map((l) => l.id)).toEqual([lid, "l1"]);
    expect(wf.parentLoop(loop(wf, "l1"))?.id).toBe(lid);
    expect(wf.parentLoop(loop(wf, lid))).toBeNull();
    expect(wf.loopSpan(loop(wf, lid))).toBe("Implement → [Critique → Refine]");
  });
  it("nest inside", () => {
    const wf = sample();
    wf.makeLoop(["b6"]);
    expect(flow(wf)).toBe("b1∥b2 → b3 → b4 → [b5 → [b6]] → b7");
  });
  it("three deep", () => {
    const [wf] = nested();
    wf.makeLoop(["b3", "b4", "b5", "b6"]);
    wf.makeLoop(["b6"]);
    expect(flow(wf)).toBe("b1∥b2 → [b3 → [b4 → [b5 → [b6]]]] → b7");
    expect(wf.loopsOf("b6").length).toBe(4);
  });
  it("insert into inner gap joins every loop", () => {
    const [wf, lid] = nested();
    const bid = wf.insert(wf.idx("b6"), "stage", "l1");
    expect(loop(wf, "l1").blocks).toEqual(["b5", bid, "b6"]);
    expect(loop(wf, lid).blocks).toEqual(["b4", "b5", bid, "b6"]);
  });
  it("insert after inner loop stays in outer", () => {
    const [wf] = nested();
    const bid = wf.insertAfter(["loop", "l1"], "stage");
    expect(flow(wf)).toBe(`b1∥b2 → b3 → [b4 → [b5 → b6] → ${bid}] → b7`);
  });
  it("move into inner and within outer", () => {
    const [wf] = nested();
    wf.moveTo("b7", wf.idx("b6"), "l1");
    expect(flow(wf)).toBe("b1∥b2 → b3 → [b4 → [b5 → b7 → b6]]");
    expect(wf.move("b4", 1)).toBe(true);
    expect(flow(wf)).toBe("b1∥b2 → b3 → [[b5 → b7 → b6] → b4]");
    expect(wf.move("b4", 1)).toBe(false);
    wf.moveTo("b4", wf.blocks.length);
    expect(flow(wf)).toBe("b1∥b2 → b3 → [b5 → b7 → b6] → b4");
    expect(wf.loops.length).toBe(1);
  });
  it("remove outer keeps inner", () => {
    const [wf, lid] = nested();
    wf.removeLoop(lid);
    expect(flow(wf)).toBe("b1∥b2 → b3 → b4 → [b5 → b6] → b7");
  });
  it("sync drops crossing and duplicate loops", () => {
    const wf = sample();
    wf.loops.push({ ...loop(wf, "l1"), id: "l2", blocks: ["b5", "b6"] });
    wf.loops.push({ ...loop(wf, "l1"), id: "l3", blocks: ["b4", "b5"] });
    wf.sync();
    expect(wf.loops.map((l) => l.id)).toEqual(["l1", "l3"]);
    expect(loop(wf, "l3").blocks).toEqual(["b4"]);
  });
  it("par inside nested loop", () => {
    const [wf, lid] = nested();
    const pid = wf.makePar(["b5", "b6"]);
    expect(pid).not.toBeNull();
    const bid = wf.addBranch(pid as string);
    expect(loop(wf, "l1").blocks).toContain(bid);
    expect(loop(wf, lid).blocks).toContain(bid);
    expect(wf.makePar(["b4", "b5"])).toBeNull();
  });
  it("prompt", () => {
    const [wf] = nested();
    const text = workflowPrompt(wf);
    const inner = text.indexOf("Loop stages 3–4 (Critique → Refine) as an agentic loop");
    const outer = text.indexOf("After each pass through stages 2–4 (Implement → [Critique → Refine])");
    expect(inner).toBeGreaterThan(-1);
    expect(outer).toBeGreaterThan(-1);
    expect(text.indexOf("4. **Refine**")).toBeLessThan(inner);
    expect(inner).toBeLessThan(outer);
    expect(outer).toBeLessThan(text.indexOf("5. **Review**"));
    expect(text).toContain("nested inside the loop over stages 2–4: run it again in full");
    expect(text.split("nested inside").length - 1).toBe(1);
  });
  it("yaml round trip", () => {
    const [wf] = nested();
    const [again, warnings] = fromYaml(toYaml(wf));
    expect(warnings).toEqual([]);
    expect(again.toDict()).toEqual(wf.toDict());
  });
});

describe("Intentions", () => {
  it("one block with defaults", () => {
    const wf = sample();
    const bid = wf.insert(0, "intentions");
    const b = blk(wf, bid);
    expect([b.type, b.toggles, b.progress_minutes]).toEqual(["intentions", [], 40]);
    expect(wf.intentions()).toBe(b);
    expect(wf.insert(3, "intentions")).toBe(bid);
    expect(wf.blocks.filter((x) => x.type === "intentions").length).toBe(1);
  });
  it("not a step and not in prompt", () => {
    const wf = sample();
    const before = workflowPrompt(wf);
    wf.insert(wf.idx("b4"), "intentions");
    expect(wf.stageNumbers()).toEqual(sample().stageNumbers());
    expect(workflowPrompt(wf)).toBe(before);
    expect(wf.makePar([(wf.intentions() as Block).id, "b4"])).toBeNull();
  });
  it("yaml round trip", () => {
    const wf = sample();
    const b = blk(wf, wf.insert(0, "intentions"));
    Object.assign(b, { toggles: ["superpowers", "workers"], worker_model: "opus", spec_only: true, mock_strength: 55, progress_format: "json" });
    const text = toYaml(wf);
    expect(text).toContain("    toggles: [superpowers, workers]");
    expect(text).toContain("    progress_format: json");
    const [again, warnings] = fromYaml(text);
    expect(warnings).toEqual([]);
    expect(again.toDict()).toEqual(wf.toDict());
  });
  it("yaml cleans and dedupes", () => {
    const text = "blocks:\n  - id: i1\n    type: intentions\n    toggles: [tests, bogus]\n    worker_model: gpt\n  - id: i2\n    type: intentions\n";
    const [wf, warnings] = fromYaml(text);
    expect(wf.ids()).toEqual(["i1"]);
    expect(warnings[0]).toContain("second intentions block");
    expect([blk(wf, "i1").toggles, blk(wf, "i1").worker_model]).toEqual([["tests"], "inherit"]);
  });
});

describe("Prompt", () => {
  it("sections", () => {
    const text = workflowPrompt(sample());
    expect(text.startsWith("## Workflow\n\n**Goal:** Match the Shop screen")).toBe(true);
    expect(text).toContain("1. **In parallel**, one worker per branch. Wait for every branch");
    expect(text).toContain("   - 1a. **Recon** — map it");
    expect(text).toContain("**Note:** Use Unity MCP.");
    expect(text).toContain("2. **Implement** — build it");
    expect(text).toContain("Loop stages 3–4 (Critique → Refine) as an agentic loop");
    expect(text).toContain("Stop when `pixel_similarity` ≥ 97, or after 8 passes");
  });
  it("loop modes", () => {
    const wf = sample();
    loop(wf, "l1").mode = "count";
    expect(workflowPrompt(wf)).toContain("run it exactly 3 times");
    loop(wf, "l1").agentic = false;
    expect(workflowPrompt(wf)).toContain("ask whether to run another pass");
  });
  it("first join", () => {
    const wf = sample();
    (wf.par("p1") as { join: unknown }).join = "first";
    expect(workflowPrompt(wf)).toContain("as soon as the first branch finishes");
  });
  it("empty", () => expect(workflowPrompt(new Workflow())).toBe("## Workflow\n\n**Goal:** <describe the goal here>"));
});

describe("Yaml", () => {
  it("round trip", () => {
    const wf = sample();
    const [again, warnings] = fromYaml(toYaml(wf));
    expect(warnings).toEqual([]);
    expect(again.toDict()).toEqual(wf.toDict());
  });
  it("matches the spec's expected to_yaml(sample())", () => {
    expect(toYaml(sample())).toBe(
      "# Stage workflow — Prompt Builder\nname: shop_screen_polish\nversion: 1\ngoal: Match the Shop screen to shop_ref.png\n" +
        "blocks:\n  - id: b1\n    type: stage\n    template: recon\n    name: Recon\n    prompt: map it\n" +
        "  - id: b2\n    type: stage\n    name: Audit\n    prompt: audit it\n  - id: b3\n    type: prompt\n    text: Use Unity MCP.\n" +
        "  - id: b4\n    type: stage\n    name: Implement\n    prompt: build it\n  - id: b5\n    type: stage\n    name: Critique\n    prompt: compare\n" +
        "  - id: b6\n    type: stage\n    name: Refine\n    prompt: fix\n  - id: b7\n    type: stage\n    name: Review\n    prompt: review\n" +
        "parallels:\n  - id: p1\n    blocks: [b1, b2]\n    join: all\n" +
        "loops:\n  - id: l1\n    blocks: [b5, b6]\n    agentic: true\n    mode: reward\n    count: 3\n    reward: Pixel diff vs ref.\n" +
        "    metric: pixel_similarity\n    target: 97\n    max_passes: 8\n",
    );
  });
  it("stage model hint", () => {
    const wf = sample();
    blk(wf, "b4").model = "sonnet";
    const text = toYaml(wf);
    expect(text.split("    model: ").length - 1).toBe(1);
    const [again, warnings] = fromYaml(text);
    expect(warnings).toEqual([]);
    expect(again.toDict()).toEqual(wf.toDict());
    const prompt = workflowPrompt(again);
    expect(prompt).toContain("2. **Implement** (run on the `sonnet` model, in a subagent if needed) — build it");
    expect(prompt.split("(run on the").length - 1).toBe(1);
  });
  it("read only label", () => {
    const wf = sample();
    blk(wf, "b4").read_only = true;
    const text = toYaml(wf);
    expect(text.split("    read_only: true").length - 1).toBe(1);
    const [again, warnings] = fromYaml(text);
    expect(warnings).toEqual([]);
    expect(blk(again, "b4").read_only).toBe(true);
    expect(blk(again, "b3").read_only).toBeFalsy();
    const prompt = workflowPrompt(again);
    expect(prompt.split("**[READ-ONLY]**").length - 1).toBe(1);
    expect(prompt).toContain("READ-ONLY: do not edit or create any project file");
  });
  it("multiline prompt block scalar round trip", () => {
    const wf = sample();
    blk(wf, "b4").prompt = "Intro.\n\n1. First\n   - nested\n# not a comment\n\nEnd.";
    const text = toYaml(wf);
    expect(text).toContain("    prompt: |-\n      Intro.\n\n      1. First");
    const [again, warnings] = fromYaml(text);
    expect(warnings).toEqual([]);
    expect(blk(again, "b4").prompt).toBe(blk(wf, "b4").prompt);
    expect(again.toDict()).toEqual(wf.toDict());
  });
  it("unknown stage model dropped", () => {
    const [wf, warnings] = fromYaml("blocks:\n  - id: s1\n    type: stage\n    name: A\n    model: gpt9\n");
    expect(blk(wf, "s1")).not.toHaveProperty("model");
    expect(warnings.length).toBe(1);
  });
  it("awkward strings", () => {
    const wf = sample();
    wf.goal = 'Fix: "quoted" # not a comment\nsecond line — ünïcode ≥ 97';
    blk(wf, "b4").name = "42";
    blk(wf, "b5").name = "true";
    blk(wf, "b3").text = "  leading space, [brackets], {braces}: colon";
    const [again] = fromYaml(toYaml(wf));
    expect(again.goal).toBe(wf.goal);
    expect(blk(again, "b4").name).toBe("42");
    expect(blk(again, "b5").name).toBe("true");
    expect(blk(again, "b3").text).toBe(blk(wf, "b3").text);
  });
  it("hand edited", () => {
    const text = `
# my workflow
name: Hand Made
goal: |
  Line one
  Line two
blocks:
  - id: s1
    type: stage
    name: 'It''s recon'
    prompt: >
      folded
      text
  - id: s2
    type: stage
    name: Two
    prompt: plain text  # trailing comment
parallels: []
loops:
  - id: l1
    blocks: [s1, s2]
    agentic: no
`;
    const [wf, warnings] = fromYaml(text);
    expect(warnings).toEqual([]);
    expect(wf.name).toBe("hand_made");
    expect(wf.goal).toBe("Line one\nLine two\n");
    expect(blk(wf, "s1").name).toBe("It's recon");
    expect(blk(wf, "s1").prompt).toBe("folded text\n");
    expect(blk(wf, "s2").prompt).toBe("plain text");
    expect(loop(wf, "l1").agentic).toBe(false);
    expect(loop(wf, "l1").max_passes).toBe(8);
  });
  it("bad input", () => {
    expect(() => fromYaml("blocks:\n  not a list item\n")).toThrow(YamlError);
    expect(() => fromYaml('goal: "unterminated\n')).toThrow(YamlError);
    const [wf, warnings] = fromYaml("blocks:\n  - id: b1\n    type: weird\n");
    expect(wf.blocks).toEqual([]);
    expect(warnings.length).toBe(1);
  });
});

describe("FunctionTests", () => {
  it("written once and used with context", () => {
    const text = workflowPrompt(withFunctions());
    expect(text.split("Critique take {{take}}").length - 1).toBe(1);
    expect(text).toContain("### Reusable instructions");
    expect(text).toContain("**Critique** (fill in: take, focus)");
    expect(text).toContain("Follow **Critique** (take: A, focus: timing, easing)");
    expect(text).toContain("Then Follow **Critique** (take: B, focus: {{FOCUS_B}}) now.");
    expect(text).toContain("**Note:** Notes may use Follow **Critique** (take: C, focus: all)");
    expect(text.indexOf("### Reusable instructions")).toBeLessThan(text.indexOf("In parallel"));
    expect(text).not.toContain("[[");
  });
  it("no blanks", () => {
    const wf = withFunctions();
    wf.blocks.push({ id: "b9", type: "function", name: "Wrap up", params: [], text: "Ship it." });
    blk(wf, "b4").text = "Then [[Wrap up]].";
    expect(wf.callProblems()).toEqual([]);
    const text = workflowPrompt(wf);
    expect(text).toContain("**Wrap up**\n\nShip it.");
    expect(text).toContain("Then Follow **Wrap up**.");
  });
  it("adds no step", () => expect(withFunctions().stageNumbers()).toEqual({ b2: "1a", b3: "1b" }));
  it("yaml round trip", () => {
    const wf = withFunctions();
    const text = toYaml(wf);
    expect(text).toContain("    params: [take, focus]");
    const [back, warnings] = fromYaml(text);
    expect(warnings).toEqual([]);
    expect(back.toDict()).toEqual(wf.toDict());
    expect(toYaml(back)).toBe(text);
  });
  it("problems", () => {
    const wf = withFunctions();
    expect(wf.callProblems()).toEqual([]);
    blk(wf, "b2").prompt = "[[Critique: take = A]] [[Nope: x = 1]] [[Critique: take = A, focus = x, extra = 1]]";
    blk(wf, "b1").text = (blk(wf, "b1").text as string) + " {{typo}}";
    const problems = wf.callProblems();
    expect(problems.some((p) => p.includes("without filling in focus"))).toBe(true);
    expect(problems.some((p) => p.includes("unknown function 'Nope'"))).toBe(true);
    expect(problems.some((p) => p.includes("unknown blank(s) extra"))).toBe(true);
    expect(problems.some((p) => p.includes("{{typo}}"))).toBe(true);
    expect(workflowPrompt(wf)).toContain("[[Nope: x = 1]]");
  });
  it("bad names and duplicates", () => {
    const wf = withFunctions();
    wf.blocks.push({ id: "b9", type: "function", name: "critique", params: [], text: "other" });
    wf.blocks.push({ id: "b10", type: "function", name: "Bad!", params: ["Two words"], text: "" });
    const problems = wf.callProblems();
    expect(problems.some((p) => p.includes("Two function blocks"))).toBe(true);
    expect(problems.some((p) => p.includes("plain name"))).toBe(true);
    expect(problems.some((p) => p.includes("one lower-case word"))).toBe(true);
    expect(wf.functions().get("critique")?.id).toBe("b1");
  });
  it("never in loops or parallels", () => {
    const wf = withFunctions();
    wf.loops = [{ id: "l1", blocks: ["b1", "b2", "b3", "b4"] } as Loop];
    wf.parallels.push({ id: "p2", blocks: ["b1"] });
    wf.sync();
    expect(wf.loops[0]?.blocks).not.toContain("b1");
    expect(wf.parallels.every((p) => !p.blocks.includes("b1"))).toBe(true);
  });
  it("calls in and callers", () => {
    const wf = withFunctions();
    expect(wf.callsIn(blk(wf, "b3"))).toEqual(["critique"]);
    expect(wf.callers("Critique").map((b) => b.id)).toEqual(["b2", "b3", "b4"]);
    expect(wf.callers("nope")).toEqual([]);
  });
  it("model hint", () => {
    const wf = withFunctions();
    blk(wf, "b1").model = "opus";
    const text = workflowPrompt(wf);
    expect(text).toContain("**Critique** (fill in: take, focus; run on the `opus` model)");
    expect(text).toContain("Follow **Critique** (take: A, focus: timing, easing), on the `opus` model");
    const [back, warnings] = fromYaml(toYaml(wf));
    expect([warnings, blk(back, "b1").model]).toEqual([[], "opus"]);
  });
  it("set use and filled", () => {
    const wf = withFunctions();
    const fn = blk(wf, "b1");
    const b3 = blk(wf, "b3");
    const uses = wf.uses(b3);
    expect(uses.length).toBe(1);
    const [f, written, args] = uses[0] as (typeof uses)[number];
    expect([f, written, Object.fromEntries(args)]).toEqual([fn, "critique", { take: "B", focus: "{{FOCUS_B}}" }]);
    args.set("focus", "pacing, colour");
    b3.prompt = setUse(b3.prompt as string, 0, fn, args);
    expect(b3.prompt).toBe('Then [[Critique: take = B, focus = "pacing, colour"]] now.');
    expect(wf.uses(b3)[0]?.[2]).toEqual(args);
    expect(useText(fn, { take: "" })).toBe("[[Critique: take = , focus = ]]");
    const segs = filled(fn, { take: "B" });
    expect(segs).toContainEqual(["B", true]);
    expect(segs).toContainEqual(["‹focus not filled in›", true]);
    expect(segs.map(([t]) => t).join("")).toBe("Critique take B, focusing on ‹focus not filled in›. Keep {{BUDGET}}.");
  });
  it("insert", () => {
    const wf = withFunctions();
    wf.loops = [{ id: "l1", blocks: ["b2", "b3"] } as Loop];
    wf.sync();
    const a = wf.insert(wf.blocks.length, "function", "l1");
    const b = wf.insert(wf.blocks.length, "function");
    expect(blk(wf, a).name).toBe("New function 1");
    expect(blk(wf, b).name).toBe("New function 2");
    expect(loop(wf, "l1").blocks).not.toContain(a);
  });
});

describe("WorkspaceTests", () => {
  it("round trip and cleaning", () => {
    const wf = new Workflow({ name: "w", workspace: { branch: "new", worktree: "bogus", base: " master " } });
    expect(wf.workspace).toEqual({ branch: "new", base: "master" });
    const text = toYaml(wf);
    expect(text).toContain("\nbranch: new\n");
    const [back] = fromYaml(text);
    expect(back.workspace).toEqual(wf.workspace);
    const [, warnings] = fromYaml("name: w\ncommit: sometimes\nblocks: []\n");
    expect(warnings.some((w) => w.includes("commit"))).toBe(true);
  });
  it("absent by default", () => {
    expect(sample().workspace).toEqual({});
    expect(toYaml(sample())).not.toContain("branch:");
  });
});

describe("OnCancelModel", () => {
  it("default is empty", () => {
    const wf = new Workflow({ name: "x" });
    expect(wf.on_cancel).toEqual({ grace_minutes: 10, stages: [] });
    expect(wf.toDict().on_cancel).toEqual({ grace_minutes: 10, stages: [] });
  });
  it("clean drops junk", () => {
    const wf = new Workflow({
      on_cancel: { grace_minutes: -3, stages: [{ name: "Stop", prompt: "stop it", model: "sonnet" }, "junk", { name: "B", prompt: "p", model: "bogus" }] },
    });
    expect(wf.on_cancel.grace_minutes).toBe(10);
    expect(wf.on_cancel.stages).toEqual([{ name: "Stop", prompt: "stop it", model: "sonnet" }, { name: "B", prompt: "p" }]);
  });
  it("add move remove", () => {
    const wf = new Workflow();
    const a = wf.addCancelStage("A", "pa");
    const b = wf.addCancelStage("B", "pb");
    expect([a, b]).toEqual([0, 1]);
    expect(wf.moveCancelStage(1, -1)).toBe(0);
    expect(wf.on_cancel.stages.map((s) => s.name)).toEqual(["B", "A"]);
    expect(wf.moveCancelStage(0, -1)).toBe(0);
    wf.removeCancelStage(0);
    expect(wf.on_cancel.stages.map((s) => s.name)).toEqual(["A"]);
  });
  it("to dict is a copy", () => {
    const wf = new Workflow({ on_cancel: { stages: [{ name: "A", prompt: "p" }] } });
    const d = wf.toDict();
    (d.on_cancel.stages[0] as { name: string }).name = "changed";
    expect(wf.on_cancel.stages[0]?.name).toBe("A");
  });
});

const CANCEL_YAML = `name: demo
version: 1
goal: g
cancel_grace_minutes: 7
on_cancel:
  - name: Stop work
    prompt: |-
      Stop every worker.
      Kill what you started.
    model: haiku
  - name: Signal
    prompt: "write cancel.done"
blocks:
  - id: b1
    type: stage
    name: One
    prompt: do it
parallels: []
loops: []
`;

describe("OnCancelYaml", () => {
  it("no on_cancel writes nothing", () => {
    const text = toYaml(sample());
    expect(text).not.toContain("on_cancel");
    expect(text).not.toContain("cancel_grace_minutes");
  });
  it("reads the section", () => {
    const [wf, warnings] = fromYaml(CANCEL_YAML);
    expect(warnings).toEqual([]);
    expect(wf.on_cancel.grace_minutes).toBe(7);
    expect(wf.on_cancel.stages.map((s) => s.name)).toEqual(["Stop work", "Signal"]);
    expect(wf.on_cancel.stages[0]?.prompt).toBe("Stop every worker.\nKill what you started.");
    expect(wf.on_cancel.stages[0]?.model).toBe("haiku");
  });
  it("round trip", () => {
    const [wf] = fromYaml(CANCEL_YAML);
    const [again, warnings] = fromYaml(toYaml(wf));
    expect(warnings).toEqual([]);
    expect(again.on_cancel).toEqual(wf.on_cancel);
    expect(toYaml(again)).toBe(toYaml(wf));
  });
  it("problems", () => {
    const wf = new Workflow({
      on_cancel: { stages: [{ name: "", prompt: "x" }, { name: "B", prompt: "" }, { name: "C", prompt: "use [[Nope]]" }] },
    });
    const problems = wf.callProblems();
    expect(problems.some((p) => p.includes("Cancel stage 1") && p.includes("name"))).toBe(true);
    expect(problems.some((p) => p.includes("Cancel stage 2") && p.includes("prompt"))).toBe(true);
    expect(problems.some((p) => p.includes("Cancel stage 3") && p.includes("unknown function"))).toBe(true);
  });
});

describe("OnCancelPrompt", () => {
  const wf = () =>
    new Workflow({
      goal: "G",
      blocks: [{ id: "b1", type: "stage", name: "Build", prompt: "build it" }],
      on_cancel: { grace_minutes: 4, stages: [{ name: "Stop", prompt: "stop workers", model: "haiku" }, { name: "Signal", prompt: "write the marker" }] },
    });
  it("absent without stages", () => expect(workflowPrompt(new Workflow({ goal: "G" }))).not.toContain("On cancel"));
  it("section after goal before steps", () => {
    const text = workflowPrompt(wf());
    expect(text.indexOf("**Goal:**")).toBeLessThan(text.indexOf("**On cancel:**"));
    expect(text.indexOf("**On cancel:**")).toBeLessThan(text.indexOf("1. **Build**"));
    expect(text).toContain("cancel.requested");
    expect(text).toContain("cancel.done");
    expect(text).toContain("not finished within 4 minutes");
    expect(text).toContain("C1. **Stop** (run on the `haiku` model, in a subagent if needed) — stop workers");
    expect(text).toContain("C2. **Signal** — write the marker");
  });
  it("cancel stages do not become steps", () => expect(wf().stageNumbers()).toEqual({ b1: "1" }));
  it("waits must also end on cancel", () => {
    const text = workflowPrompt(wf());
    expect(text).toContain("Every wait you start");
    expect(text).toContain("[ -e cancel.requested ]");
  });
});
