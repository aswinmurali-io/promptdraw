// Port of the Python app's test_compile.py (workflow file -> prompt). The CLI tests run against the
// pure CLI helpers; the workflow is the shared sample fixture.
import { describe, expect, it } from "vitest";
import { sample } from "../test/fixtures";
import {
  CliError,
  DEFAULT_STATE,
  buildPrompt,
  cliCompile,
  compileCommand,
  compileWorkflow,
  loadConfig,
  migrateState,
  withIntentions,
  type CliOptions,
} from "./compile";
import { summary } from "./intentions";
import { Workflow, type Block } from "./workflow";
import { fromYaml, toYaml } from "./yaml";

// The sample workflow with an intentions block that has the toggles these tests switch off.
const PIPELINE = toYaml(withIntentions(sample(), ["progress", "dashboard", "unity_cli"]));

function setup() {
  const [wf] = fromYaml(PIPELINE);
  return { wf, cfg: { ...structuredClone(DEFAULT_STATE) } as Record<string, unknown> };
}

const cli = (o: Partial<CliOptions>): CliOptions => ({ workflow: "workflows/sample.yaml", on: [], off: [], set: [], ...o });

describe("CompileTests", () => {
  it("matches build_prompt", () => {
    const { wf, cfg } = setup();
    const [text, sections] = compileWorkflow(wf, cfg);
    expect(text).toBe(buildPrompt({ ...cfg, tab: "stages", workflow: wf.toDict() })[0]);
    expect(text.startsWith("## Workflow")).toBe(true);
    expect(sections).toContain("git");
  });

  it("path and object agree (YAML text and parsed workflow)", () => {
    const { wf, cfg } = setup();
    expect(compileWorkflow(fromYaml(PIPELINE)[0], cfg)).toEqual(compileWorkflow(wf, cfg));
  });

  it("pipeline loads clean", () => expect(fromYaml(PIPELINE)[1]).toEqual([]));

  it("state overrides", () => {
    const { wf, cfg } = setup();
    expect(compileWorkflow(wf, cfg, { base: "master", branch: "new" })[0]).toContain("Create a new branch off `master`");
  });

  it("workflow pins beat saved config", () => {
    const { wf: base, cfg } = setup();
    const c2 = { ...cfg, branch: "same", worktree: "per_task" };
    const wf = new Workflow({ ...base.toDict(), workspace: { branch: "new", worktree: "none" } });
    let [text] = compileWorkflow(wf, c2);
    expect(text).toContain("Create a new branch for this work");
    expect(text).toContain("Do NOT create worktrees");
    [text] = compileWorkflow(wf, c2, { branch: "same" });
    expect(text).toContain("Do NOT create a new branch");
  });

  it("with intentions", () => {
    const { wf: base, cfg } = setup();
    const wf = withIntentions(base, ["progress"], ["dashboard"], { progress_format: "json" });
    const block = wf.intentions() as Block & { toggles: string[] };
    expect(block.toggles).not.toContain("dashboard");
    expect(block.toggles).toContain("progress");
    const [text] = compileWorkflow(wf, cfg);
    expect(text).toContain("progress.json");
    expect(text).not.toContain("Basic dashboard");
    expect((base.intentions() as Block & { toggles: string[] }).toggles).toContain("dashboard");
  });

  it("with intentions adds a block", () => {
    const bare = new Workflow({ name: "x", goal: "g", blocks: [{ id: "s1", type: "stage", name: "A", prompt: "p" }] });
    expect((withIntentions(bare, ["tests"]).intentions() as Block).toggles).toEqual(["tests"]);
  });

  it("inline only", () => {
    const { wf: base, cfg } = setup();
    const wf = withIntentions(base, ["inline", "workers", "recon"]);
    const [text] = compileWorkflow(wf, cfg);
    expect(text).toContain("**Inline agent only** — Do ALL the work yourself");
    expect(text).not.toContain("**Multiple workers**");
    expect(text).not.toContain("**Recon via workers**");
    expect(text).not.toContain("Only exception");
    expect(summary(wf.intentions() as Block)).not.toContain("Multiple workers");
  });

  it("inline keeps review and critique", () => {
    const { wf, cfg } = setup();
    const cases: [Record<string, boolean>, string, string | null][] = [
      [{ inline_review: true }, "code reviews and audits", "critiques ("],
      [{ inline_critique: true }, "critiques (", "code reviews and audits"],
      [{ inline_review: true, inline_critique: true }, "audits (code review, adversarial / architecture audits, PR review) and critiques", null],
    ];
    for (const [keep, want, absent] of cases) {
      const [text] = compileWorkflow(withIntentions(wf, ["inline"], [], keep), cfg);
      expect(text).toContain("Only exception: ");
      expect(text).toContain(want);
      if (absent) expect(text).not.toContain(absent);
    }
  });

  it("inline settings round trip yaml", () => {
    const { wf: base } = setup();
    const [back] = fromYaml(toYaml(withIntentions(base, ["inline"], [], { inline_review: true })));
    const ib = back.intentions() as Block;
    expect(ib.inline_review).toBe(true);
    expect(ib.inline_critique).toBe(false);
    expect(ib.toggles).toContain("inline");
  });

  it("cli bool settings", () => {
    const { wf, cfg } = setup();
    const { text } = cliCompile(cli({ on: ["inline"], set: ["inline_review=false", "inline_critique=true"] }), wf, cfg);
    expect(text).toContain("critiques (");
    expect(text).not.toContain("code reviews and audits");
  });

  it("load config without file", () => expect(loadConfig()).toEqual(DEFAULT_STATE));

  it("cli", () => {
    const { wf, cfg } = setup();
    const r = cliCompile(cli({ out: "p.md", off: ["dashboard"], set: ["progress_format=json"], base: "main" }), wf, cfg);
    expect(r.text).toContain("`main`");
    expect(r.text).not.toContain("Basic dashboard");
    expect(r.summary).toMatch(/^p\.md: \d+ lines · workflow \d+ steps, git, unity \+1, how to work \+\d+$/);
    expect(cliCompile(cli({}), wf, cfg).text.startsWith("## Workflow")).toBe(true);
    expect(compileCommand(cli({ out: "p.md", off: ["dashboard"], set: ["progress_format=json"], base: "main" }))).toBe(
      "python3 compile.py workflows/sample.yaml -o p.md --base main --off dashboard --set progress_format=json",
    );
  });

  it("unity cli preflight and old mcp_check key", () => {
    const { wf, cfg } = setup();
    const [text, sections] = compileWorkflow(wf, cfg);
    expect(text).toContain('unity status --project-path "$UNITY_PROJECT_PATH" --json');
    expect(sections).toContain("unity +1");
    const [, s2] = compileWorkflow(wf, cfg, { mcp_check: false });
    expect(s2).toContain("unity");
    expect(s2).not.toContain("unity +1");
    const saved = loadConfig('{"mcp_check": false, "toggles": {"unity_mcp": true}}');
    expect(saved.cli_check).toBe(false);
    expect(saved).not.toHaveProperty("mcp_check");
    expect(saved.toggles).toEqual({ unity_cli: true });
    expect(migrateState({ mcp_check: false, cli_check: true }).cli_check).toBe(true);
  });

  it("unity cli toggle and its old name", () => {
    const { wf, cfg } = setup();
    const [text] = compileWorkflow(wf, cfg);
    expect(text).toContain("**Nudge Unity CLI usage**");
    // The sample's own prompt block says "Use Unity MCP."; no other text may name the old tool.
    expect(text.replace("Use Unity MCP.", "")).not.toContain("Unity MCP");
    expect(compileWorkflow(withIntentions(wf, [], ["unity_mcp"]), cfg)[0]).not.toContain("Nudge Unity CLI usage");
  });

  it("cli rejects unknown toggle", () => {
    const { wf, cfg } = setup();
    expect(() => cliCompile(cli({ on: ["nope"] }), wf, cfg)).toThrow(CliError);
    expect(() => cliCompile(cli({ set: ["bogus=1"] }), wf, cfg)).toThrow(CliError);
  });
});
