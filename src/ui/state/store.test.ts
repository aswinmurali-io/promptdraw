import { describe, expect, it } from "vitest";
import { appDefaults, Workflow } from "../../core";
import { COALESCE_MS, effectiveWorkspace, initialState, pinnedKeys, reducer, type UiState } from "./store";

function run(state: UiState, ...actions: Parameters<typeof reducer>[1][]): UiState {
  return actions.reduce(reducer, state);
}

describe("store reducer", () => {
  it("records edits and undoes / redoes them", () => {
    let s = run(initialState(), { type: "toggle", key: "tests", on: true }, { type: "set", patch: { branch: "same" } });
    expect(s.cfg.toggles.tests).toBe(true);
    expect(s.cfg.branch).toBe("same");
    s = reducer(s, { type: "undo" });
    expect(s.cfg.branch).toBe("off");
    expect(s.cfg.toggles.tests).toBe(true);
    s = reducer(s, { type: "undo" });
    expect(s.cfg.toggles.tests).toBe(false);
    expect(s.past).toHaveLength(0);
    s = run(s, { type: "redo" }, { type: "redo" });
    expect(s.cfg.branch).toBe("same");
    expect(s.future).toHaveLength(0);
  });

  it("merges rapid edits of one field into one undo step", () => {
    let s = run(
      initialState(),
      { type: "set", patch: { task: "a" }, coalesce: "task", at: 1000 },
      { type: "set", patch: { task: "ab" }, coalesce: "task", at: 1200 },
      { type: "set", patch: { task: "abc" }, coalesce: "task", at: 1200 + COALESCE_MS + 1 },
    );
    expect(s.past).toHaveLength(2);
    s = reducer(s, { type: "undo" });
    expect(s.cfg.task).toBe("ab");
  });

  it("does not record unchanged toggles or unrecorded sets", () => {
    let s = reducer(initialState(), { type: "toggle", key: "tests", on: false });
    expect(s.past).toHaveLength(0);
    s = reducer(s, { type: "set", patch: { mode: "dark" }, record: false });
    expect(s.cfg.mode).toBe("dark");
    expect(s.past).toHaveLength(0);
  });

  it("takes another tab's save as one undoable step, keeping this tab's view and theme", () => {
    let s = run(initialState(), { type: "set", patch: { task: "mine" } }, { type: "set", patch: { tab: "stages", mode: "dark" }, record: false });
    const theirs = { ...appDefaults(), task: "theirs", tab: "task" as const, mode: "light" as const };
    s = reducer(s, { type: "external", cfg: theirs });
    expect(s.cfg.task).toBe("theirs");
    expect(s.cfg.tab).toBe("stages");
    expect(s.cfg.mode).toBe("dark");
    expect(s.past).toHaveLength(2);
    s = reducer(s, { type: "undo" });
    expect(s.cfg.task).toBe("mine");
  });

  it("keeps the theme across undo", () => {
    let s = run(initialState(), { type: "toggle", key: "pr", on: true }, { type: "set", patch: { mode: "dark" }, record: false });
    s = reducer(s, { type: "undo" });
    expect(s.cfg.mode).toBe("dark");
    expect(s.cfg.toggles.pr).toBe(false);
  });

  it("reset clears task, notes and toggles but keeps the workflow", () => {
    const wf = new Workflow({ name: "keep_me" }).toDict();
    const start = { ...appDefaults(), task: "t", extra: "x", branch: "same" as const, workflow: wf, tab: "stages" as const };
    start.toggles = { ...start.toggles, tests: true };
    const s = reducer(initialState(start), { type: "reset" });
    expect(s.cfg.task).toBe("");
    expect(s.cfg.extra).toBe("");
    expect(s.cfg.branch).toBe("off");
    expect(s.cfg.toggles.tests).toBe(false);
    expect(s.cfg.workflow.name).toBe("keep_me");
    expect(s.cfg.tab).toBe("stages");
  });

  it("edits a workflow pin on the Stages tab and removes a blank one", () => {
    const wf = new Workflow({ name: "w", workspace: { branch: "new", base: "main" } }).toDict();
    let s = initialState({ ...appDefaults(), tab: "stages", branch: "same", workflow: wf });
    expect(effectiveWorkspace(s.cfg).branch).toBe("new");
    expect([...pinnedKeys(s.cfg)]).toEqual(["branch", "base"]);
    s = reducer(s, { type: "workspace", key: "branch", value: "same" });
    expect(s.cfg.workflow.workspace.branch).toBe("same");
    s = reducer(s, { type: "workspace", key: "base", value: "  " });
    expect("base" in s.cfg.workflow.workspace).toBe(false);
    // Unpinned keys only change the rail value.
    s = reducer(s, { type: "workspace", key: "commit", value: "none" });
    expect(s.cfg.commit).toBe("none");
    expect("commit" in s.cfg.workflow.workspace).toBe(false);
  });

  it("does not touch pins on the Task tab", () => {
    const wf = new Workflow({ name: "w", workspace: { branch: "new" } }).toDict();
    const s = reducer(initialState({ ...appDefaults(), tab: "task", workflow: wf }), { type: "workspace", key: "branch", value: "same" });
    expect(s.cfg.branch).toBe("same");
    expect(s.cfg.workflow.workspace.branch).toBe("new");
  });
});
