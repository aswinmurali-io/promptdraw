// A/B forks on the stage canvas: which blocks group into a fork, how the lanes are laid out, and
// that the flag choices and mode survive a save. Not in the Python app, so these tests are the spec.
// @lat: [[testing#Prompt flag tests]]
import { describe, expect, it } from "vitest";
import { buildPrompt } from "./compile";
import { appDefaults, appState, loadAppConfig, serializeAppConfig } from "./config";
import { forkGroups, inlineStates, variantChoice, variantStates } from "./forks";
import { FORK_LABEL_H, layout, wrap, type Box, type TextLines } from "./layout";
import { Workflow } from "./workflow";

const textLines: TextLines = (text, _mode, width, maxLines) => wrap(text, (t) => 7 * Array.from(t).length, width, maxLines);
const stage = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, type: "stage", name, prompt: name + " text", ...extra });
const FLAGS = [{ name: "play_bot", type: "bool", default: false }];

function fork(blocks: Record<string, unknown>[], extra: Record<string, unknown> = {}): Workflow {
  return new Workflow({ name: "ab", flags: FLAGS, blocks, ...extra });
}

describe("fork groups", () => {
  it("groups consecutive blocks that read one flag with two different conditions", () => {
    const wf = fork([stage("b1", "A"), stage("b2", "New", { when: "play_bot" }), stage("b3", "Old", { when: "!play_bot" }), stage("b4", "Z")]);
    expect(forkGroups(wf)).toEqual([{ id: "fork:b2", flag: "play_bot", blocks: ["b2", "b3"] }]);
  });

  it("leaves a lone when block, an equal-condition run and blocks in a parallel group out", () => {
    expect(forkGroups(fork([stage("b1", "A", { when: "play_bot" }), stage("b2", "B")]))).toEqual([]);
    expect(forkGroups(fork([stage("b1", "A", { when: "play_bot" }), stage("b2", "B", { when: "play_bot" })]))).toEqual([]);
    const par = fork([stage("b1", "A", { when: "play_bot" }), stage("b2", "B", { when: "!play_bot" })], { parallels: [{ id: "p1", blocks: ["b1", "b2"], join: "all" }] });
    expect(forkGroups(par)).toEqual([]);
  });

  it("starts a new fork at another flag and lets a function on the shelf sit between", () => {
    const wf = new Workflow({
      name: "ab",
      flags: [...FLAGS, { name: "v", type: "text", default: "a" }],
      blocks: [stage("b1", "A", { when: "play_bot" }), { id: "f1", type: "function", name: "Fn", params: [], text: "x" }, stage("b2", "B", { when: "!play_bot" }), stage("b3", "C", { when: 'v == "a"' }), stage("b4", "D", { when: 'v == "b"' })],
    });
    expect(forkGroups(wf).map((f) => [f.flag, f.blocks])).toEqual([["play_bot", ["b1", "b2"]], ["v", ["b3", "b4"]]]);
  });

  it("does not span a loop's edge", () => {
    const wf = fork([stage("b1", "A", { when: "play_bot" }), stage("b2", "B", { when: "!play_bot" })], { loops: [{ id: "l1", blocks: ["b2"] }] });
    expect(forkGroups(wf)).toEqual([]);
  });
});

describe("variant states", () => {
  const wf = fork([stage("b1", "New", { when: "play_bot" }), stage("b2", "Old", { when: "!play_bot" }), stage("b3", "Plain")]);

  it("letters the conditions and marks the chosen side from the defaults, then from given values", () => {
    expect([...variantStates(wf)].map(([id, v]) => [id, v.letter, v.selected])).toEqual([["b1", "A", false], ["b2", "B", true]]);
    expect([...variantStates(wf, { play_bot: true })].map(([id, v]) => [id, v.selected])).toEqual([["b1", true], ["b2", false]]);
  });

  it("falls back to the defaults for a value the flag cannot take", () => {
    expect(variantStates(wf, { play_bot: "maybe" }).get("b1")?.selected).toBe(false);
  });
});

describe("fork layout", () => {
  const wf = fork([stage("b1", "Before"), stage("b2", "New", { when: "play_bot" }), stage("b3", "Old", { when: "!play_bot" }), stage("b4", "After")]);
  const L = layout(wf, 600, textLines);
  const box = (k: string) => L.cards.get(k) as Box;

  it("draws one frame with the lanes stacked and a label row above each card", () => {
    expect([...L.forks.keys()]).toEqual(["fork:b2"]);
    expect([...L.pars.keys()]).toEqual([]);
    const [fx0, fy0, fx1, fy1] = L.forks.get("fork:b2") as Box;
    for (const id of ["b2", "b3"]) {
      const [x0, y0, x1, y1] = box(id);
      expect(x0).toBeGreaterThan(fx0);
      expect(x1).toBeLessThan(fx1);
      expect(y0).toBeGreaterThanOrEqual(fy0);
      expect(y1).toBeLessThanOrEqual(fy1);
      expect((L.forkLabels.get(id) as [number, number])[1]).toBeLessThan(y0);
    }
    expect(box("b3")[1]).toBeGreaterThanOrEqual(box("b2")[3] + FORK_LABEL_H);
    expect(box("b2")[0]).toBe(box("b3")[0]);
  });

  it("puts the flow before and after the fork on one line, joined by a fan of edges", () => {
    expect(box("b1")[2]).toBeLessThan((L.forks.get("fork:b2") as Box)[0]);
    expect(box("b4")[0]).toBeGreaterThan((L.forks.get("fork:b2") as Box)[2]);
    expect(L.edges.length).toBe(1 + 2 + 2);
  });

  it("keeps a fork inside a loop and the loop frame round it", () => {
    const inLoop = fork([stage("b1", "New", { when: "play_bot" }), stage("b2", "Old", { when: "!play_bot" })], { loops: [{ id: "l1", blocks: ["b1", "b2"] }] });
    const M = layout(inLoop, 600, textLines);
    const [lx0, , lx1] = M.loops.get("l1") as Box;
    const [fx0, , fx1] = M.forks.get("fork:b1") as Box;
    expect(lx0).toBeLessThan(fx0);
    expect(lx1).toBeGreaterThan(fx1);
  });
});

describe("flag choices in the saved config", () => {
  const withFlags = () => ({ ...appDefaults(), tab: "stages" as const, workflow: fork([stage("b1", "New", { when: "play_bot" }), stage("b2", "Old", { when: "!play_bot" })]).toDict() });

  it("a config with no flag choices serialises as before", () => {
    const text = serializeAppConfig(appDefaults());
    expect(text).not.toMatch(/flags|flagMode/);
    expect(loadAppConfig(text).flags).toEqual({});
    expect(loadAppConfig(text).flag_mode).toBe("embed");
  });

  it("saves and reloads the chosen values and the mode", () => {
    const cfg = { ...withFlags(), flags: { play_bot: true }, flag_mode: "strip" as const };
    const back = loadAppConfig(serializeAppConfig(cfg));
    expect(back.flags).toEqual({ play_bot: true });
    expect(back.flag_mode).toBe("strip");
  });

  it("builds the prompt from them: embed by default, strip when asked, stale values ignored", () => {
    const cfg = withFlags();
    const embed = buildPrompt(appState({ ...cfg, flags: { play_bot: true } }))[0];
    expect(embed).toContain("New [Variant A (play_bot): use]");
    expect(embed).toContain("Old [Variant B (!play_bot): skip, not selected]");
    const strip = buildPrompt(appState({ ...cfg, flags: { play_bot: true }, flag_mode: "strip" }))[0];
    expect(strip).toContain("New");
    expect(strip).not.toContain("Old");
    expect(() => buildPrompt(appState({ ...cfg, flags: { gone: true, play_bot: "maybe" } }))).not.toThrow();
  });
});

describe("inline branches", () => {
  const split = (extra: Record<string, unknown> = {}) =>
    new Workflow({
      name: "ab",
      flags: [...FLAGS, { name: "v", type: "text", default: "a" }],
      blocks: [
        stage("b1", "Plain"),
        stage("b2", "Split", { prompt: "Do {{#if play_bot}}new{{#else}}old{{/if}} and {{#if v == \"b\"}}B{{#elif v == \"a\"}}A{{/if}}" }),
        { id: "n1", type: "prompt", text: "{{#if play_bot}}note{{/if}}" },
        { id: "f1", type: "function", name: "Fn", params: [], text: "x {{#if !play_bot}}y{{/if}}" },
        stage("b3", "Gated", { when: "play_bot" }),
      ],
      ...extra,
    });

  it("finds the chains of every stage, prompt block and function, with the branch each flag value picks", () => {
    const m = inlineStates(split());
    expect([...m.keys()]).toEqual(["b2", "n1", "f1"]);
    const b2 = m.get("b2")!;
    expect(b2.flags).toEqual(["play_bot", "v"]);
    expect(b2.count).toBe(4);
    expect(b2.chains[0]!.branches.map((r) => [r.letter, r.cond, r.body, r.chosen])).toEqual([["A", "play_bot", "new", false], ["B", null, "old", true]]);
    expect(b2.chains[1]!.branches.map((r) => [r.letter, r.cond, r.chosen])).toEqual([["A", 'v == "b"', false], ["B", 'v == "a"', true]]);
    expect(b2.letter).toBe("B");
    expect(m.get("n1")!.letter).toBeNull();
    expect(m.get("f1")!.letter).toBe("A");
  });

  it("follows the given values and reports one letter when every chain agrees", () => {
    const m = inlineStates(split(), { play_bot: true, v: "b" });
    expect(m.get("b2")!.letter).toBe("A");
    expect(m.get("n1")!.letter).toBe("A");
    expect(m.get("f1")!.letter).toBeNull();
  });

  it("leaves out a block whose markers are malformed and one with no branches", () => {
    const wf = new Workflow({ name: "x", flags: FLAGS, blocks: [stage("b1", "Open", { prompt: "{{#if play_bot}}never closed" }), stage("b2", "Plain")] });
    expect(inlineStates(wf).size).toBe(0);
  });
});

describe("choosing a variant", () => {
  const wf = new Workflow({
    name: "x",
    flags: [...FLAGS, { name: "v", type: "text", default: "a" }, { name: "t", type: "text", default: "" }],
    blocks: [
      stage("a", "A", { when: "play_bot" }),
      stage("b", "B", { when: "!play_bot" }),
      stage("c", "C", { when: 'v == "x"' }),
      stage("d", "D", { when: 'v != "a"' }),
      stage("e", "E", { when: "t" }),
      stage("g", "G"),
    ],
  });

  it("gives the bool value, or says the variant is already chosen", () => {
    expect(variantChoice(wf, undefined, "a")).toEqual({ flag: "play_bot", value: true, already: false });
    expect(variantChoice(wf, undefined, "b")).toEqual({ flag: "play_bot", value: false, already: true });
    expect(variantChoice(wf, { play_bot: true }, "b")).toEqual({ flag: "play_bot", value: false, already: false });
  });

  it("gives the text a == names, a value for != and null when no single value does", () => {
    expect(variantChoice(wf, undefined, "c")).toEqual({ flag: "v", value: "x", already: false });
    expect(variantChoice(wf, undefined, "d")).toEqual({ flag: "v", value: "", already: false });
    expect(variantChoice(wf, undefined, "e")).toEqual({ flag: "t", value: null, already: false });
  });

  it("is null for a block with no when", () => {
    expect(variantChoice(wf, undefined, "g")).toBeNull();
    expect(variantChoice(wf, undefined, "nope")).toBeNull();
  });
});
