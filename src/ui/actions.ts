// The action registry: every command is declared once here and the toolbar, main menu,
// command palette, shortcuts dialog and global key handler all read from it, so labels and
// shortcuts never drift apart.
// @lat: [[ui#Actions and shortcuts]]
import { TOGGLE_ORDER, TOGGLE_TEXT, type AppConfig, type ThemeMode, type ToggleKey } from "../core";
import type { IconName } from "./components/Icon";
import { isTyping, keyLabel, matches, type KeySpec } from "./lib/keys";
import { REPO_URL } from "./lib/ribbon";
import { toggleBlocked } from "./lib/rules";
import { THEME_LABEL } from "./lib/theme";

export type Category = "Modes" | "Panels" | "Prompt" | "Stages" | "File" | "Edit" | "View" | "Intentions" | "Help";
export const CATEGORY_ORDER: Category[] = ["Modes", "Prompt", "Stages", "File", "Edit", "View", "Panels", "Intentions", "Help"];

/**
 * Category order with the current tab's own commands first: Stages when the stage editor's
 * commands are registered (only on the Stages tab), else Prompt (copy, edit task).
 */
export function paletteOrder(actions: AppAction[]): Category[] {
  const lead: Category = actions.some((a) => a.category === "Stages") ? "Stages" : "Prompt";
  return [lead, ...CATEGORY_ORDER.filter((c) => c !== lead)];
}

export interface AppAction {
  id: string;
  label: string;
  /** Visible text on toolbar buttons, when shorter than `label`. */
  short?: string;
  /** Visible text on the phone tab bar, when even `short` is too wide there. */
  phone?: string;
  /** One-line description for tooltips. */
  hint?: string;
  category: Category;
  icon?: IconName;
  keywords?: string[];
  keys?: KeySpec[];
  /** Fire even while a text field has focus (default: only shortcuts with a modifier do). */
  inText?: boolean;
  enabled?: boolean;
  /** For toggles and modes: currently on / selected. */
  checked?: boolean;
  perform: () => void;
}

export interface ActionContext {
  cfg: AppConfig;
  canUndo: boolean;
  canRedo: boolean;
  showProps: boolean;
  showOutput: boolean;
  hasPrompt: boolean;
  /** A copy just succeeded: Copy prompt says "Copied" with a tick for a moment. */
  copied?: boolean;
  setTab: (tab: AppConfig["tab"]) => void;
  toggleProps: () => void;
  toggleOutput: () => void;
  /** How to work is open (Simple task tab only). */
  showWork?: boolean;
  toggleWork?: () => void;
  copyPrompt: () => void;
  openFile: () => void;
  saveConfig: () => void;
  exportWorkflow: () => void;
  exportPrompt: () => void;
  reset: () => void;
  undo: () => void;
  redo: () => void;
  setTheme: (mode: ThemeMode) => void;
  cycleTheme: () => void;
  toggle: (key: ToggleKey, on: boolean) => void;
  focusTask: () => void;
  openShortcuts: () => void;
  /** Optional features register their actions only when wired. */
  openPalette?: () => void;
  zoom?: { in: () => void; out: () => void; reset: () => void; value: number; min?: number; max?: number; fit?: () => void };
  showWelcome?: () => void;
  openIntro?: () => void;
  /** Stage editor commands; present only on the Stages tab. */
  stages?: StageActions;
}

export interface StageActions {
  add: (kind: "stage" | "prompt" | "function" | "intentions") => void;
  hasIntentions: boolean;
  canLoop: boolean;
  canPar: boolean;
  makeLoop: () => void;
  makePar: () => void;
  fit: () => void;
  canDelete: boolean;
  removeFocused: () => void;
  canMoveBack: boolean;
  canMoveForward: boolean;
  move: (d: -1 | 1) => void;
  hasSelection: boolean;
  /** A block, frame, the Goal or the cancel lane is open in the inspector. */
  hasFocus: boolean;
  escape: () => void;
  selectAll: () => void;
  save: () => void;
  newWorkflow: () => void;
  /** Prompt flags (A/B variants): the workflow declares some, the popover is open, how the variants not chosen are treated. */
  hasFlags?: boolean;
  flagsOpen?: boolean;
  toggleFlags?: () => void;
  flagMode?: "embed" | "strip";
  toggleFlagMode?: () => void;
}

/** Settings download on every tab (Alt keeps it apart from Mod+S, which saves the workflow on Stages). */
const SAVE_SETTINGS_KEY: KeySpec = { key: "s", code: "KeyS", mod: true, alt: true };

export function buildActions(c: ActionContext): AppAction[] {
  const task = c.cfg.tab === "task";
  const list: AppAction[] = [
    { id: "mode.task", label: "Simple task", short: "Simple task", phone: "Task", hint: "Describe the task and tick how the agent should work", category: "Modes", icon: "pencil", keys: [{ key: "1" }], checked: task, keywords: ["tab", "mode"], perform: () => c.setTab("task") },
    { id: "mode.stages", label: "Stages", hint: "Build a multi-stage workflow on a canvas", category: "Modes", icon: "stages", keys: [{ key: "2" }], checked: !task, keywords: ["tab", "mode", "workflow"], perform: () => c.setTab("stages") },
    { id: "panel.props", label: "Settings panel", short: "Settings", hint: "Show or hide the git, worktree, commit and Unity settings", category: "Panels", icon: "settingsPanel", keys: [{ key: "3" }], checked: c.showProps, keywords: ["options", "git", "branch", "worktree", "properties", "rail", "show", "hide"], perform: c.toggleProps },
    { id: "panel.output", label: "Prompt panel", short: "Prompt", hint: "Show or hide the compiled prompt, ready to copy", category: "Panels", icon: "promptPanel", keys: [{ key: "4" }], checked: c.showOutput, keywords: ["output", "show", "hide"], perform: c.toggleOutput },
    { id: "prompt.copy", label: "Copy prompt", short: c.copied ? "Copied" : "Copy prompt", hint: "Copy the compiled prompt to the clipboard", category: "Prompt", icon: c.copied ? "check" : "copy", keys: [{ key: "Enter", mod: true }], enabled: c.hasPrompt, keywords: ["clipboard"], perform: c.copyPrompt },
    { id: "prompt.focusTask", label: "Edit task", category: "Prompt", icon: "pencil", keys: [{ key: "t" }], enabled: task, keywords: ["focus", "type"], perform: c.focusTask },
    { id: "file.open", label: "Open…", category: "File", icon: "open", keys: [{ key: "o", mod: true }], keywords: ["import", "load", "json", "yaml", "config", "workflow"], perform: c.openFile },
    // Mod+S saves what the tab is about: settings here, the workflow on Stages (the Python app's Save).
    { id: "file.saveConfig", label: "Save settings (JSON)", category: "File", icon: "save", keys: task ? [{ key: "s", mod: true }, SAVE_SETTINGS_KEY] : [SAVE_SETTINGS_KEY], keywords: ["export", "download", "prompt_builder.json", "config"], perform: c.saveConfig },
    { id: "file.exportWorkflow", label: "Export workflow (YAML)", category: "File", icon: "fileCode", keys: [{ key: "s", mod: true, shift: true }], keywords: ["save", "download", "yaml", "stages"], perform: c.exportWorkflow },
    { id: "file.exportPrompt", label: "Export prompt (Markdown)", category: "File", icon: "fileText", keys: [{ key: "e", mod: true, shift: true }], enabled: c.hasPrompt, keywords: ["download", "md"], perform: c.exportPrompt },
    { id: "file.reset", label: "Reset…", category: "File", icon: "reset", keywords: ["clear", "defaults"], perform: c.reset },
    { id: "edit.undo", label: "Undo", category: "Edit", icon: "undo", keys: [{ key: "z", mod: true }], enabled: c.canUndo, perform: c.undo },
    { id: "edit.redo", label: "Redo", category: "Edit", icon: "redo", keys: [{ key: "z", mod: true, shift: true }, { key: "y", mod: true }], enabled: c.canRedo, perform: c.redo },
    { id: "view.theme", label: "Toggle theme", category: "View", icon: c.cfg.mode === "dark" ? "moon" : c.cfg.mode === "light" ? "sun" : "system", keys: [{ key: "d", code: "KeyD", alt: true, shift: true }], inText: true, keywords: ["dark", "light", "system", "appearance"], perform: c.cycleTheme },
    ...(["light", "dark", "auto"] as ThemeMode[]).map(
      (mode): AppAction => ({
        id: `view.theme.${mode}`,
        label: `Theme: ${THEME_LABEL[mode]}`,
        category: "View",
        icon: mode === "dark" ? "moon" : mode === "light" ? "sun" : "system",
        checked: c.cfg.mode === mode,
        keywords: ["appearance", "colour", "color"],
        perform: () => c.setTheme(mode),
      }),
    ),
    { id: "help.star", label: "Star on GitHub", hint: "Open the promptdraw repository in a new tab", category: "Help", icon: "star", keywords: ["github", "repository", "source", "code", "star", "support"], perform: () => void window.open(REPO_URL, "_blank", "noopener,noreferrer") },
    { id: "help.shortcuts", label: "Keyboard shortcuts", category: "Help", icon: "keyboard", keys: [{ key: "?" }], keywords: ["help", "keys"], perform: c.openShortcuts },
  ];
  if (c.openPalette)
    list.push({ id: "help.palette", label: "Command palette", short: "Search", hint: "Find and run any command by name", category: "Help", icon: "search", keys: [{ key: "k", mod: true }, { key: "/", mod: true }, { key: "k", ctrl: true }], inText: true, keywords: ["search", "actions"], perform: c.openPalette });
  if (c.zoom) {
    const z = c.zoom;
    list.push(
      { id: "view.zoomIn", label: "Zoom in", category: "View", icon: "plus", keys: [{ key: "=", mod: true }, { key: "+", mod: true }], enabled: z.value < (z.max ?? ZOOM_MAX), perform: z.in },
      { id: "view.zoomOut", label: "Zoom out", category: "View", icon: "minus", keys: [{ key: "-", mod: true }], enabled: z.value > (z.min ?? ZOOM_MIN), perform: z.out },
      { id: "view.zoomReset", label: "Reset zoom", category: "View", icon: "focus", keys: [{ key: "0", mod: true }], perform: z.reset },
      // The Simple task board's Fit (the Stages tab has its own, with the stage tools).
      ...(z.fit && !c.stages ? [<AppAction>{ id: "view.fit", label: "Zoom to fit", short: "Fit", hint: "Show the whole board", category: "View", icon: "fit", keys: [{ key: "1", code: "Digit1", shift: true }], keywords: ["view", "all", "zoom", "out"], perform: z.fit }] : []),
    );
  }
  if (task && c.toggleWork)
    list.push({ id: "panel.work", label: "How to work panel", short: "How to work", hint: "Show or hide the How to work options", category: "Panels", icon: "toggle", checked: !!c.showWork, keywords: ["options", "toggles", "intentions", "show", "hide", "close"], perform: c.toggleWork });
  if (c.stages) list.push(...stageActions(c.stages));
  if (c.showWelcome) list.push({ id: "help.welcome", label: "Show welcome hints", category: "Help", icon: "help", keywords: ["intro", "tour"], perform: c.showWelcome });
  if (c.openIntro) list.push({ id: "help.intro", label: "Watch the intro video", category: "Help", icon: "play", keywords: ["video", "tour", "demo", "intro", "tutorial"], perform: c.openIntro });
  for (const key of TOGGLE_ORDER) {
    const on = c.cfg.toggles[key];
    list.push({
      id: `toggle.${key}`,
      label: `${on ? "Turn off" : "Turn on"}: ${TOGGLE_TEXT[key][0]}`,
      category: "Intentions",
      icon: "toggle",
      checked: on,
      enabled: task && toggleBlocked(key, c.cfg.toggles) === null,
      keywords: ["toggle", "how to work", key],
      perform: () => c.toggle(key, !on),
    });
  }
  return list;
}

function stageActions(s: StageActions): AppAction[] {
  const cat: Category = "Stages";
  return [
    { id: "stages.addStage", label: "Add stage", short: "Stage", hint: "Add a stage block after the focused block", category: cat, icon: "block", keys: [{ key: "s" }], keywords: ["new", "block", "step"], perform: () => s.add("stage") },
    { id: "stages.addPrompt", label: "Add prompt block", short: "Prompt block", hint: "Add a free-text prompt block", category: cat, icon: "note", keys: [{ key: "p" }], keywords: ["note", "text"], perform: () => s.add("prompt") },
    { id: "stages.addFunction", label: "Add function block", short: "Function", hint: "Add reusable instructions that stages can call", category: cat, icon: "fn", keys: [{ key: "f" }], keywords: ["reusable", "instructions", "call"], perform: () => s.add("function") },
    { id: "stages.addIntentions", label: "Add intentions block", category: cat, icon: "intentions", keys: [{ key: "i" }], enabled: !s.hasIntentions, keywords: ["how to work", "toggles"], perform: () => s.add("intentions") },
    { id: "stages.loop", label: "Loop selected blocks", short: "Loop", hint: "Repeat the ticked blocks until a condition holds", category: cat, icon: "loop", keys: [{ key: "l" }], enabled: s.canLoop, keywords: ["repeat", "agentic", "group"], perform: s.makeLoop },
    { id: "stages.parallel", label: "Run selected in parallel", short: "Parallel", hint: "Run the ticked blocks side by side", category: cat, icon: "parallel", keys: [{ key: "g" }], enabled: s.canPar, keywords: ["branch", "group", "fan out"], perform: s.makePar },
    { id: "stages.fit", label: "Zoom to fit", short: "Fit", hint: "Show the whole workflow", category: cat, icon: "fit", keys: [{ key: "1", code: "Digit1", shift: true }], keywords: ["view", "all", "zoom"], perform: s.fit },
    { id: "stages.delete", label: "Delete focused block", category: cat, icon: "trash", keys: [{ key: "Delete" }, { key: "Backspace" }], enabled: s.canDelete, keywords: ["remove"], perform: s.removeFocused },
    { id: "stages.moveBack", label: "Move block up / left", category: cat, icon: "arrowUp", keys: [{ key: "ArrowUp", alt: true }, { key: "ArrowLeft", alt: true }], enabled: s.canMoveBack, keywords: ["reorder", "earlier"], perform: () => s.move(-1) },
    { id: "stages.moveForward", label: "Move block down / right", category: cat, icon: "arrowDown", keys: [{ key: "ArrowDown", alt: true }, { key: "ArrowRight", alt: true }], enabled: s.canMoveForward, keywords: ["reorder", "later"], perform: () => s.move(1) },
    { id: "stages.selectAll", label: "Select all blocks", category: cat, icon: "selectAll", keys: [{ key: "a", mod: true }], inText: false, keywords: ["tick"], perform: s.selectAll },
    // Only offered when there is something to clear or close; Escape itself still always runs.
    { id: "stages.escape", label: s.hasSelection ? "Clear selection" : "Close inspector", category: cat, icon: "close", keys: [{ key: "Escape" }], enabled: s.hasSelection || s.hasFocus, keywords: ["deselect"], perform: s.escape },
    { id: "stages.save", label: "Save workflow", category: cat, icon: "save", keys: [{ key: "s", mod: true }], keywords: ["library", "yaml", "workflows"], perform: s.save },
    { id: "stages.new", label: "New workflow", category: cat, icon: "plus", keywords: ["clear", "untitled"], perform: s.newWorkflow },
    ...(s.toggleFlags
      ? [
          { id: "stages.flags", label: "Prompt flags", short: "Flags", hint: "Choose which A/B variant the prompt follows", category: cat, icon: "flag" as const, enabled: !!s.hasFlags, checked: !!s.flagsOpen, keywords: ["a/b", "variant", "test", "branch", "toggle"], perform: s.toggleFlags },
        ]
      : []),
    ...(s.toggleFlagMode
      ? [
          { id: "stages.flagMode", label: s.flagMode === "strip" ? "Prompt flags: embed both variants" : "Prompt flags: strip the variants not chosen", category: cat, icon: "flag" as const, enabled: !!s.hasFlags, keywords: ["a/b", "variant", "embed", "strip", "mode"], perform: s.toggleFlagMode },
        ]
      : []),
  ];
}

export const ZOOM_MIN = 50;
export const ZOOM_MAX = 200;
export const ZOOM_STEP = 10;

/** Undo / redo inside a text field belong to the field, not the app. */
const NATIVE_IN_TEXT = new Set(["edit.undo", "edit.redo"]);

/** Run the action bound to this key event. Returns the action that ran, if any. */
export function handleShortcut(e: KeyboardEvent, actions: AppAction[]): AppAction | null {
  const typing = isTyping(e.target);
  for (const a of actions) {
    for (const k of a.keys ?? []) {
      if (!matches(e, k)) continue;
      if (typing && (NATIVE_IN_TEXT.has(a.id) || !(a.inText ?? !!k.mod))) return null;
      e.preventDefault();
      if (a.enabled !== false) a.perform();
      return a;
    }
  }
  return null;
}

export function shortcutLabel(a: AppAction | undefined): string | undefined {
  const k = a?.keys?.[0];
  return k ? keyLabel(k) : undefined;
}
