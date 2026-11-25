import { describe, expect, it, vi } from "vitest";
import { appDefaults } from "../core";
import { buildActions, paletteOrder, type ActionContext, type StageActions } from "./actions";

function stages(over: Partial<StageActions> = {}): StageActions {
  const f = vi.fn();
  return {
    add: f, hasIntentions: false, canLoop: false, canPar: false, makeLoop: f, makePar: f, fit: f,
    canDelete: false, removeFocused: f, canMoveBack: false, canMoveForward: false, move: f,
    hasSelection: false, hasFocus: false, escape: f, selectAll: f, save: f, newWorkflow: f,
    ...over,
  };
}

function ctx(over: Partial<ActionContext> = {}): ActionContext {
  const f = vi.fn();
  return {
    cfg: appDefaults(), canUndo: false, canRedo: false, showProps: false, showOutput: true, hasPrompt: true,
    setTab: f, toggleProps: f, toggleOutput: f, copyPrompt: f, openFile: f, saveConfig: f, exportWorkflow: f,
    exportPrompt: f, reset: f, undo: f, redo: f, setTheme: f, cycleTheme: f, toggle: f, focusTask: f,
    openShortcuts: f, openPalette: f, showWelcome: f,
    zoom: { in: f, out: f, reset: f, value: 100 },
    ...over,
  };
}

describe("action registry", () => {
  it("gives every command an icon, so the palette's icon column never breaks", () => {
    const missing = buildActions(ctx({ stages: stages() })).filter((a) => !a.icon).map((a) => a.id);
    expect(missing).toEqual([]);
  });

  it("offers Close inspector only while something is open, and Clear selection while ticked", () => {
    const find = (s: StageActions) => buildActions(ctx({ stages: s })).find((a) => a.id === "stages.escape")!;
    expect(find(stages()).enabled).toBe(false);
    expect(find(stages({ hasFocus: true }))).toMatchObject({ label: "Close inspector", enabled: true });
    expect(find(stages({ hasSelection: true }))).toMatchObject({ label: "Clear selection", enabled: true });
  });

  it("lists the current tab's own commands first in the palette", () => {
    expect(paletteOrder(buildActions(ctx({ stages: stages() })))[0]).toBe("Stages");
    expect(paletteOrder(buildActions(ctx()))[0]).toBe("Prompt");
  });
});
