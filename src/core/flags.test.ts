// Prompt flags: A/B variants resolved before compile. Not in the Python app, so these tests are the spec.
// @lat: [[testing#Prompt flag tests]]
import { describe, expect, it } from "vitest";
import { compileWorkflow } from "./compile";
import { FlagError, applyFlags, cleanFlags, flagValues, parseFlagArgs, resolveFlagsDict, whenVariants, type FlagMode } from "./flags";
import { Workflow } from "./workflow";
import { fromYaml, toYaml } from "./yaml";

const SRC = `# Stage workflow — Prompt Builder
name: ab
version: 1
goal: Ship it
flags:
  - name: play_bot
    type: bool
    default: false
    label: Use Play Bot
  - name: variant
    type: text
    default: a
blocks:
  - id: f1
    type: function
    when: play_bot
    name: Play check
    params: []
    text: Run the play bot.
  - id: b1
    type: stage
    name: Build
    prompt: |-
      Build the page.
      {{#if play_bot}}
      Verify with [[Play check]].
      {{#elif variant == "b"}}
      Verify in variant b.
      {{#else}}
      Verify in Play Mode yourself.
      {{/if}}
      Done, variant {{@variant}}.
  - id: b2
    type: stage
    when: play_bot
    name: Play stage
    prompt: Drive the game.
  - id: b3
    type: stage
    when: "!play_bot"
    name: Old stage
    prompt: Old way.
  - id: b4
    type: stage
    name: Ship
    prompt: Open the PR.
parallels: []
loops: []
`;

const compile = (flags?: Record<string, boolean | string>, mode: FlagMode = "strip"): string => {
  const [wf] = fromYaml(SRC);
  return compileWorkflow(wf, null, { base: "main", branch: "new" }, flags, mode)[0];
};

describe("flag values", () => {
  it("uses defaults, then given values, and reads on/off words for a bool flag", () => {
    const defs = cleanFlags([{ name: "x", type: "bool", default: "on" }, { name: "t", type: "text" }]);
    expect(Object.fromEntries(flagValues(defs))).toEqual({ x: true, t: "" });
    expect(Object.fromEntries(flagValues(defs, { x: "off", t: "hi" }))).toEqual({ x: false, t: "hi" });
  });

  it("refuses an unknown flag and a bool flag that is not on or off", () => {
    const defs = cleanFlags([{ name: "x" }]);
    expect(() => flagValues(defs, { y: true })).toThrow(FlagError);
    expect(() => flagValues(defs, { x: "maybe" })).toThrow(/on or off/);
  });

  it("parses --flag KEY=VALUE, a bare KEY meaning on", () => {
    expect(parseFlagArgs(["a=b=c", "x"])).toEqual({ a: "b=c", x: "true" });
    expect(() => parseFlagArgs(["Bad=1"])).toThrow(FlagError);
  });
});

describe("flag text", () => {
  const vals = (o: Record<string, boolean | string>) =>
    flagValues(cleanFlags(Object.entries(o).map(([name, v]) => ({ name, type: typeof v === "boolean" ? "bool" : "text", default: v }))));

  it("keeps only the chosen branch, inline", () => {
    const t = "A {{#if on}}yes{{#else}}no{{/if}} B";
    expect(applyFlags(t, vals({ on: true }), "t")).toBe("A yes B");
    expect(applyFlags(t, vals({ on: false }), "t")).toBe("A no B");
  });

  it("takes the first matching elif, compares text exactly and nests", () => {
    const t = '{{#if v == "a"}}A{{#elif v == "b"}}B{{#if on}}!{{/if}}{{#else}}C{{/if}}';
    expect(applyFlags(t, vals({ v: "b", on: true }), "t")).toBe("B!");
    expect(applyFlags(t, vals({ v: "B", on: true }), "t")).toBe("C");
    expect(applyFlags(t, vals({ v: "a", on: true }), "t")).toBe("A");
  });

  it("reads a text flag as true when it is not empty or an off word, and != and !", () => {
    expect(applyFlags("{{#if v}}1{{/if}}", vals({ v: "x" }), "t")).toBe("1");
    expect(applyFlags("{{#if v}}1{{/if}}", vals({ v: "off" }), "t")).toBe("");
    expect(applyFlags('{{#if v != "x"}}1{{/if}}', vals({ v: "y" }), "t")).toBe("1");
    expect(applyFlags("{{#if !v}}1{{/if}}", vals({ v: "" }), "t")).toBe("1");
  });

  it("fills in {{@flag}} and leaves other {{ }} text alone", () => {
    expect(applyFlags("v={{@v}} {{PROJECT_BASE}} {{blank}}", vals({ v: "b" }), "t")).toBe("v=b {{PROJECT_BASE}} {{blank}}");
  });

  it("drops a tag's own line so no blank lines are left", () => {
    const t = "a\n{{#if on}}\nb\n{{#else}}\nc\n{{/if}}\nd\n";
    expect(applyFlags(t, vals({ on: true }), "t")).toBe("a\nb\nd\n");
    expect(applyFlags(t, vals({ on: false }), "t")).toBe("a\nc\nd\n");
  });

  it("throws on an unclosed if, a stray tag, a branch after else and an unknown flag", () => {
    const v = vals({ on: true });
    expect(() => applyFlags("{{#if on}}x", v, "t")).toThrow(/never closed/);
    expect(() => applyFlags("x{{/if}}", v, "t")).toThrow(/no \{\{#if\}\}/);
    expect(() => applyFlags("{{#if on}}a{{#else}}b{{#elif on}}c{{/if}}", v, "t")).toThrow(/after its/);
    expect(() => applyFlags("{{#if nope}}x{{/if}}", v, "t")).toThrow(/unknown flag/);
    expect(() => applyFlags("{{#if !on == x}}x{{/if}}", v, "t")).toThrow(/mixes/);
  });
});

describe("compiling with flags", () => {
  it("flag off: legacy branch, old stage, no trace of the other branches", () => {
    const p = compile();
    expect(p).toContain("Verify in Play Mode yourself.");
    expect(p).toContain("Old stage");
    expect(p).not.toMatch(/Play check|variant b|Play stage|\{\{|when:/);
    expect(p).toContain("Done, variant a.");
  });

  it("flag on: Play Bot branch, its stage, and stages renumber", () => {
    const p = compile({ play_bot: true });
    expect(p).toContain("Verify with Follow **Play check**.");
    expect(p).not.toContain("Old stage");
    expect(p).toMatch(/2\. \*\*Play stage\*\*/);
    expect(p).toMatch(/3\. \*\*Ship\*\*/);
  });

  it("a text flag picks its branch", () => {
    const p = compile({ variant: "b" });
    expect(p).toContain("Verify in variant b.");
    expect(p).toContain("Done, variant b.");
  });

  it("refuses an unknown flag", () => {
    expect(() => compile({ nope: true })).toThrow(FlagError);
  });

  it("a workflow without flags compiles as before, and a dropped block leaves its parallel group sound", () => {
    const plain = new Workflow({ name: "p", blocks: [{ id: "b1", type: "stage", name: "A", prompt: "x" }] });
    expect(resolveFlagsDict(plain.toDict())).toEqual(plain.toDict());
    expect(compileWorkflow(plain, null, { base: "main", branch: "new" }, {} as never)[0]).toBe(
      compileWorkflow(plain, null, { base: "main", branch: "new" })[0],
    );
    const wf = new Workflow({
      name: "g",
      flags: [{ name: "f" }],
      blocks: [
        { id: "b1", type: "stage", name: "A", prompt: "a" },
        { id: "b2", type: "stage", name: "B", prompt: "b", when: "f" },
        { id: "b3", type: "stage", name: "C", prompt: "c" },
      ],
      parallels: [{ id: "p1", blocks: ["b1", "b2", "b3"], join: "all" }],
    });
    const off = new Workflow(resolveFlagsDict(wf.toDict()));
    expect(off.blocks.map((b) => b.id)).toEqual(["b1", "b3"]);
    expect(off.parallels[0]?.blocks).toEqual(["b1", "b3"]);
    const one = new Workflow(resolveFlagsDict({ ...wf.toDict(), blocks: wf.toDict().blocks.map((b) => (b.id === "b3" ? { ...b, when: "f" } : b)) }));
    expect(one.parallels).toEqual([]);
  });
});

describe("embed mode", () => {
  const vals = (o: Record<string, boolean | string>) =>
    flagValues(cleanFlags(Object.entries(o).map(([name, v]) => ({ name, type: typeof v === "boolean" ? "bool" : "text", default: v }))));

  it("keeps every inline branch, labelled, and says which to use", () => {
    expect(applyFlags("x {{#if on}}yes{{#else}}no{{/if}} y", vals({ on: true }), "t", "embed")).toBe(
      "x **Variant A (on):** yes **Variant B (otherwise):** no **Use variant A.** y",
    );
    expect(applyFlags("{{#if on}}yes{{#else}}no{{/if}}", vals({ on: false }), "t", "embed")).toContain("**Use variant B.**");
  });

  it("labels a standalone branch on its own lines and numbers elif branches", () => {
    const t = '{{#if v == "a"}}\nA text\n{{#elif v == "b"}}\nB text\n{{#else}}\nC text\n{{/if}}\nafter\n';
    expect(applyFlags(t, vals({ v: "b" }), "t", "embed")).toBe(
      '**Variant A (v == "a"):**\nA text\n**Variant B (v == "b"):**\nB text\n**Variant C (otherwise):**\nC text\n**Use variant B.**\nafter\n',
    );
  });

  it("says when no variant applies", () => {
    expect(applyFlags("{{#if on}}x{{/if}}", vals({ on: false }), "t", "embed")).toContain("No variant applies");
  });

  it("compiles with both stages kept, each marked use or skip, and both branches in the text", () => {
    const p = compile({ play_bot: true }, "embed");
    expect(p).toContain("Play stage [Variant A (play_bot): use]");
    expect(p).toContain("Old stage [Variant B (!play_bot): skip, not selected]");
    expect(p).toContain("**Variant A (play_bot):**");
    expect(p).toContain("Verify in Play Mode yourself.");
    expect(p).toContain("**Use variant A.**");
    expect(p).toContain("**Variant A (play_bot): use.** Run the play bot.");
  });

  it("is the compile default", () => {
    const [wf] = fromYaml(SRC);
    const d = compileWorkflow(wf, null, { base: "main", branch: "new" })[0];
    expect(d).toBe(compile(undefined, "embed"));
    expect(d).toContain("Old stage [Variant B (!play_bot): use]");
  });

  it("letters a flag's conditions in document order", () => {
    const [wf] = fromYaml(SRC);
    expect([...whenVariants(wf.toDict().blocks)]).toEqual([
      ["play_bot", { flag: "play_bot", letter: "A" }],
      ["!play_bot", { flag: "play_bot", letter: "B" }],
    ]);
  });
});

describe("flags in YAML", () => {
  it("round-trips flags, when and markers, and reports no problems", () => {
    const [wf, warnings] = fromYaml(SRC);
    expect(warnings).toEqual([]);
    expect(wf.flags.map((f) => [f.name, f.type, f.default, f.label])).toEqual([
      ["play_bot", "bool", false, "Use Play Bot"],
      ["variant", "text", "a", undefined],
    ]);
    expect(wf.block("b3")?.when).toBe("!play_bot");
    const again = toYaml(fromYaml(toYaml(wf))[0]);
    expect(again).toBe(toYaml(wf));
    expect(toYaml(wf)).toContain('when: "!play_bot"');
  });

  it("a workflow without flags writes no flags or when", () => {
    expect(toYaml(new Workflow({ name: "p", blocks: [{ id: "b1", type: "stage", name: "A", prompt: "x" }] }))).not.toMatch(/flags|when/);
  });

  it("warns about undeclared flags, bad markers and flags nothing uses", () => {
    const bad = SRC.replace("when: play_bot", "when: nope").replace("{{/if}}", "").replace("  - name: variant", "  - name: spare\n  - name: variant");
    const w = fromYaml(bad)[1].join("\n");
    expect(w).toMatch(/unknown flag 'nope'/);
    expect(w).toMatch(/never closed/);
    expect(w).toMatch(/'spare' is declared but nothing uses it/);
  });
});
