// Port of the Python app's test_prompt_builder.py: the pure prompt-building logic.
import { describe, expect, it } from "vitest";
import { RECON_MODELS, TOGGLE_ORDER, WORKER_MODELS, type ToggleKey } from "./constants";
import { buildPrompt } from "./compile";
import { toggleLine } from "./intentions";
import { appDefaults, appState, loadAppConfig, serializeAppConfig } from "./config";

type State = Record<string, unknown> & { toggles: Record<string, boolean> };

function baseState(overrides: Record<string, unknown> = {}): State {
  return {
    task: "do the thing",
    extra: "",
    branch: "new",
    base: "",
    worktree: "per_task",
    commit: "atomic",
    unity: "existing",
    cli_check: false,
    copy_env: true,
    worker_model: "inherit",
    recon_model: "opus",
    toggles: Object.fromEntries(TOGGLE_ORDER.map((k) => [k, false])),
    ...overrides,
  };
}

function withToggles(state: State, ...on: ToggleKey[]): State {
  for (const k of on) state.toggles[k] = true;
  return state;
}

const text = (s: Record<string, unknown>) => buildPrompt(s)[0];

describe("ModelChoices", () => {
  it("worker models", () => expect(WORKER_MODELS).toEqual(["inherit", "fable", "opus", "sonnet"]));
  it("recon models", () => expect(RECON_MODELS).toEqual(["opus", "sonnet"]));
  it("new toggles in order", () => {
    for (const k of ["workers", "recon", "high_confidence", "android_cdp"] as const) expect(TOGGLE_ORDER).toContain(k);
    expect(TOGGLE_ORDER.indexOf("recon")).toBeLessThan(TOGGLE_ORDER.indexOf("workers"));
  });
  it("dashboard toggle", () => {
    expect(TOGGLE_ORDER).toContain("dashboard");
    const [label, t] = toggleLine("dashboard", {});
    expect(label).toBe("Basic dashboard");
    for (const needle of ["timeline", "ETA", "blocked", "agent log", "text box", "inbox"]) {
      expect(needle === needle.toLowerCase() ? t.toLowerCase() : t).toContain(needle);
    }
  });
});

describe("Workers", () => {
  it("off by default", () => expect(text(baseState())).not.toContain("Multiple workers"));
  it("inherit says inherit and names no model", () => {
    const t = text(withToggles(baseState({ worker_model: "inherit" }), "workers"));
    expect(t).toContain("**Multiple workers**");
    expect(t).toContain("inherit");
    for (const m of ["fable", "opus", "sonnet"]) expect(t).not.toContain(`\`${m}\``);
  });
  it("explicit model named", () => {
    for (const m of ["fable", "opus", "sonnet"]) {
      const t = text(withToggles(baseState({ worker_model: m }), "workers"));
      expect(t).toContain(`\`${m}\``);
      expect(t).not.toContain("inherit");
    }
  });
});

describe("Recon", () => {
  it("off by default", () => expect(text(baseState())).not.toContain("Recon via workers"));
  it("names model", () => {
    for (const m of ["opus", "sonnet"]) {
      const t = text(withToggles(baseState({ recon_model: m }), "recon", "workers"));
      expect(t).toContain("**Recon via workers**");
      expect(t).toContain(`\`${m}\``);
    }
  });
  it("requires workers", () => {
    const [t, sections] = buildPrompt(withToggles(baseState(), "recon"));
    expect(t).not.toContain("Recon via workers");
    expect(sections).not.toContain("how to work +1");
  });
  it("recon model independent of worker model", () => {
    const t = text(withToggles(baseState({ worker_model: "fable", recon_model: "sonnet" }), "workers", "recon"));
    const lines = t.split("\n");
    const recon = lines.find((l) => l.includes("Recon via workers")) as string;
    const workers = lines.find((l) => l.includes("Multiple workers")) as string;
    expect(recon).toContain("`sonnet`");
    expect(recon).not.toContain("`fable`");
    expect(workers).toContain("`fable`");
  });
});

describe("CopyEnv", () => {
  it("on by default with worktree", () => {
    const s = baseState();
    delete s.copy_env;
    expect(text(s)).toContain("`.env`");
  });
  it("off", () => expect(text(baseState({ copy_env: false }))).not.toContain("`.env`"));
  it("ignored without worktree", () => expect(text(baseState({ worktree: "none", copy_env: true }))).not.toContain("`.env`"));
});

describe("SimpleToggles", () => {
  it("high confidence", () => {
    expect(text(baseState())).not.toContain("High-confidence fixes only");
    expect(text(withToggles(baseState(), "high_confidence"))).toContain("**High-confidence fixes only**");
  });
  it("android cdp", () => {
    expect(text(baseState())).not.toContain("Android emulator");
    const t = text(withToggles(baseState(), "android_cdp"));
    expect(t).toContain("**Test on Android emulator (CDP)**");
    expect(t).toContain("Chrome DevTools Protocol");
    expect(t).toContain("development patch");
  });
});

describe("Mocks", () => {
  it("off by default", () => expect(text(baseState())).not.toContain("mock iterations"));
  it("after ui", () => expect(TOGGLE_ORDER.indexOf("mocks")).toBe(TOGGLE_ORDER.indexOf("ui") + 1));
  it("count default three", () => {
    const s = withToggles(baseState(), "mocks");
    delete s.mock_count;
    const t = text(s);
    expect(t).toContain("**Mock iterations**");
    expect(t).toContain("show me 3 distinct mock iterations");
  });
  it("count from field", () => {
    expect(text(withToggles(baseState({ mock_count: "5" }), "mocks"))).toContain("show me 5 distinct mock iterations");
  });
  it("bad count falls back", () => {
    for (const bad of ["", "0", "abc", "-2"]) {
      expect(text(withToggles(baseState({ mock_count: bad }), "mocks")), bad).toContain("show me 3 distinct");
    }
  });
  it("hint off by default", () => {
    expect(text(withToggles(baseState({ mock_strength: 30 }), "mocks"))).not.toContain("deviation");
  });
  it("hint strength", () => {
    expect(text(withToggles(baseState({ mock_hint: true, mock_strength: 30 }), "mocks"))).toContain("roughly 30%");
    expect(text(withToggles(baseState({ mock_hint: true, mock_strength: 100 }), "mocks"))).toContain("roughly 100%");
  });
  it("hint strength defaults and clamps", () => {
    expect(text(withToggles(baseState({ mock_hint: true }), "mocks"))).toContain("roughly 30%");
    expect(text(withToggles(baseState({ mock_hint: true, mock_strength: 250 }), "mocks"))).toContain("roughly 100%");
  });
  it("hint ignored when mocks off", () => {
    expect(text(baseState({ mock_hint: true, mock_strength: 60 }))).not.toContain("deviation");
  });
});

describe("SpecOnly", () => {
  it("off by default", () => {
    const t = text(withToggles(baseState(), "superpowers"));
    expect(t).toContain("`using-superpowers`");
    expect(t).not.toContain("writing-plans");
  });
  it("skips plan keeps spec", () => {
    const t = text(withToggles(baseState({ spec_only: true }), "superpowers"));
    expect(t).toContain("`writing-plans`");
    expect(t).toContain("spec");
    expect(t).toContain("Do NOT");
  });
  it("needs superpowers", () => expect(text(baseState({ spec_only: true }))).not.toContain("writing-plans"));
});

describe("Progress", () => {
  it("off by default", () => expect(text(baseState())).not.toContain("Progress reports"));
  it("default forty minutes", () => {
    const s = withToggles(baseState(), "progress");
    delete s.progress_minutes;
    const t = text(s);
    expect(t).toContain("**Progress reports**");
    expect(t).toContain("Every 40 minutes");
    expect(t).toContain("| Task | Status | % done | ETA |");
  });
  it("minutes from field", () => {
    expect(text(withToggles(baseState({ progress_minutes: "15" }), "progress"))).toContain("Every 15 minutes");
  });
  it("bad minutes fall back", () => {
    for (const bad of ["", "0", "abc", "-5"]) {
      expect(text(withToggles(baseState({ progress_minutes: bad }), "progress")), bad).toContain("Every 40 minutes");
    }
  });
  it("default format is output", () => {
    const t = text(withToggles(baseState(), "progress"));
    expect(t).toContain("| Task | Status | % done | ETA |");
    expect(t).not.toContain("progress.json");
  });
  it("json format dumps file", () => {
    const t = text(withToggles(baseState({ progress_format: "json" }), "progress"));
    expect(t).toContain("Every 40 minutes of work, dump a progress update as JSON to `progress.json`");
    expect(t).toContain('"pct_done"');
    expect(t).not.toContain("| Task | Status |");
  });
  it("bad format falls back", () => {
    expect(text(withToggles(baseState({ progress_format: "xml" }), "progress"))).toContain("| Task | Status | % done | ETA |");
  });
});

const WF = {
  name: "demo",
  goal: "Ship the shop screen",
  blocks: [
    { id: "b1", type: "stage", name: "Recon", prompt: "map it" },
    { id: "b2", type: "stage", name: "Build", prompt: "build it" },
  ],
  parallels: [],
  loops: [],
};

describe("StagesMode", () => {
  it("task mode default", () => {
    const [t, sections] = buildPrompt(baseState({ workflow: WF }));
    expect(t).toContain("## Task");
    expect(t).not.toContain("## Workflow");
    expect(sections[0]).toBe("task");
  });
  it("stages mode swaps task for workflow", () => {
    const [t, sections] = buildPrompt(baseState({ tab: "stages", workflow: WF, extra: "side note" }));
    expect(t.startsWith("## Workflow\n\n**Goal:** Ship the shop screen")).toBe(true);
    expect(t).toContain("1. **Recon** — map it");
    expect(t).not.toContain("## Task");
    expect(t).not.toContain("side note");
    expect(t).toContain("## Workspace & git");
    expect(sections[0]).toBe("workflow 2 steps");
  });
  it("stages mode without workflow", () => {
    const [t, sections] = buildPrompt(baseState({ tab: "stages" }));
    expect(t).toContain("## Workflow");
    expect(sections[0]).toBe("workflow");
  });
  it("matches the spec's expected stages prompt", () => {
    expect(text(baseState({ tab: "stages", workflow: WF, extra: "side note" }))).toBe(
      [
        "## Workflow",
        "",
        "**Goal:** Ship the shop screen",
        "",
        "Work through these steps in order. Finish each step before starting the next, and tell me when you move on.",
        "",
        "1. **Recon** — map it",
        "2. **Build** — build it",
        "",
        "## Workspace & git",
        "",
        "- Create a new branch for this work, named after the task.",
        "- Use a dedicated git worktree per task so tasks stay isolated from each other and from my working copy.",
        "- When creating a worktree, copy the `.env` files (e.g. `.env`, `.env.local`) from my main working copy into it — they are gitignored, so git does not carry them over.",
        "- Make atomic commits: one focused commit per logical change, with a clear message.",
        "",
        "## Unity",
        "",
        "- Use the already-running Unity instance. Do NOT spawn a new Unity Editor.",
        "",
      ].join("\n"),
    );
  });
});

describe("StagesIntentions", () => {
  it("no block no how to work", () => {
    const [t, sections] = buildPrompt(withToggles(baseState({ tab: "stages", workflow: WF }), "tests", "review"));
    expect(t).not.toContain("## How to work");
    expect(sections.some((s) => s.startsWith("how to work"))).toBe(false);
  });
  it("block supplies its own toggles", () => {
    const wf = {
      ...WF,
      blocks: [
        ...WF.blocks,
        { id: "i1", type: "intentions", toggles: ["workers", "progress"], worker_model: "sonnet", progress_minutes: 15, progress_format: "json" },
      ],
    };
    const [t, sections] = buildPrompt(withToggles(baseState({ tab: "stages", workflow: wf }), "tests"));
    expect(t).toContain("## How to work");
    expect(t).toContain("Run every worker with the `sonnet` model.");
    expect(t).toContain("Every 15 minutes");
    expect(t).toContain("`progress.json`");
    expect(t).not.toContain("Tests matter");
    expect(sections).toContain("how to work +2");
    expect(t).toContain("1. **Recon**");
  });
});

describe("Regression", () => {
  it("sections count", () => {
    expect(buildPrompt(withToggles(baseState(), "tests", "review"))[1]).toEqual(["task", "git", "unity", "how to work +2"]);
  });
  it("missing model keys fall back", () => {
    const s = withToggles(baseState(), "workers", "recon");
    delete s.worker_model;
    delete s.recon_model;
    const t = text(s);
    expect(t).toContain("inherit");
    expect(t).toContain("`opus`");
  });
});

describe("promptdraw additions", () => {
  const on = (keys: string[], extra: Record<string, unknown> = {}) =>
    buildPrompt({ ...appState(appDefaults()), ...extra, toggles: Object.fromEntries(keys.map((k) => [k, true])) })[0];

  it("caps the recon workers only when a cap is set", () => {
    expect(on(["workers", "recon"])).toContain("to several parallel worker subagents");
    expect(on(["workers", "recon"], { recon_count: "4" })).toContain("to at most 4 parallel worker subagents");
    expect(on(["workers", "recon"], { recon_count: "0" })).toContain("to several parallel worker subagents");
  });

  it("adds the self-loop review only on top of the code review", () => {
    expect(on(["review_loop"])).not.toContain("Self-loop code review");
    const p = on(["review", "review_loop"], { review_passes: "7" });
    expect(p).toContain("**Self-loop code review**");
    expect(p).toContain("or after 7 passes");
    expect(p).toContain("fresh `opus` reviewer subagent");
    expect(p).toContain("list them for me");
    expect(on(["review", "review_loop"], { review_minor: true })).toContain("Fix medium and low findings in the same passes.");
  });

  it("saves nothing new while the additions are off, so the Python app configs round-trip", () => {
    const state = appState(appDefaults());
    expect(Object.keys(state.toggles as object)).not.toContain("review_loop");
    expect(state).not.toHaveProperty("recon_count");
    const cfg = loadAppConfig(serializeAppConfig({ ...appDefaults(), recon_count: "2", review_minor: true, toggles: { ...appDefaults().toggles, review: true, review_loop: true } }));
    expect([cfg.recon_count, cfg.review_minor, cfg.toggles.review_loop]).toEqual(["2", true, true]);
  });
});

describe("recon cap", () => {
  it("never asks for more than five recon workers", async () => {
    const { reconCount } = await import("./intentions");
    expect([reconCount("3"), reconCount("9"), reconCount(""), reconCount("0")]).toEqual([3, 5, null, null]);
  });
});
