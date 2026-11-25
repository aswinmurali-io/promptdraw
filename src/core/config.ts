// The Prompt Builder app's saved config (the Python app's `.prompt_builder.json`): load it the way
// prompt_builder.App.load_config does, turn it into build_prompt state the way App.state()
// does, and write it back the way App.save_config does (json.dump, indent=2, ASCII-escaped).
// @lat: [[core#Modules]]
import {
  MOCK_COUNT_DEFAULT,
  MOCK_STRENGTH_DEFAULT,
  PROGRESS_MINUTES_DEFAULT,
  EXTRA_TOGGLES,
  RECON_MODELS,
  REVIEW_PASSES_DEFAULT,
  TOGGLE_ORDER,
  WORKER_MODELS,
  WORKSPACE,
  oneOf,
  type Branch,
  type Commit,
  type ProgressFormat,
  type ReconModel,
  type ToggleKey,
  type WorkerModel,
  type Worktree,
} from "./constants";
import { cleanFlags, usableFlags, type FlagMode, type FlagValues } from "./flags";
import { migrateToggles, mockCount, mockStrength, positiveInt, progressFormat, reconCount, type AnyState } from "./intentions";
import { PyFloat, fmtNum, isPlainObject, pyIntParse, pyJsonDumps, pyJsonLoads, pyStr, pyStrip, truthy } from "./py";
import { Workflow, type WorkflowDict } from "./workflow";

export type ThemeMode = "auto" | "light" | "dark";
export type Tab = "task" | "stages";

/** Everything the app keeps. `task` / `extra` are the field text without Tk's trailing "\n". */
export interface AppConfig {
  task: string;
  extra: string;
  branch: Branch;
  base: string;
  worktree: Worktree;
  commit: Commit;
  unity: string;
  cli_check: boolean;
  copy_env: boolean;
  worker_model: WorkerModel;
  recon_model: ReconModel;
  spec_only: boolean;
  inline_review: boolean;
  inline_critique: boolean;
  /** Text-field value, as the Tk entry holds it. */
  progress_minutes: string;
  progress_format: ProgressFormat;
  /** Text-field value, as the Tk entry holds it. */
  mock_count: string;
  mock_hint: boolean;
  mock_strength: number;
  /** promptdraw: Recon's worker cap as typed; empty while not set. */
  recon_count: string;
  /** promptdraw: the self-loop review's pass cap, as typed. */
  review_passes: string;
  /** promptdraw: the self-loop review fixes medium and low findings too. */
  review_minor: boolean;
  toggles: Record<ToggleKey, boolean>;
  /** promptdraw: the value of each prompt flag (flags.ts) the preview and copy use; a flag not named keeps its default. */
  flags: FlagValues;
  /** promptdraw: `embed` keeps every A/B variant in the prompt and marks the chosen one, `strip` removes the others. */
  flag_mode: FlagMode;
  tab: Tab;
  workflow: WorkflowDict;
  mode: ThemeMode;
  inspector_w: number;
}

/** Inspector pane width: default and clamp range. */
export const SIDE_W = 300;
export const INSPECTOR_MIN = 260;
export const INSPECTOR_MAX = 1400;
export const THEME_MODES: ThemeMode[] = ["auto", "light", "dark"];

/** `App.__init__` (and Reset) defaults: these differ from compile.DEFAULT_STATE. */
export function appDefaults(): AppConfig {
  return {
    task: "",
    extra: "",
    branch: "off",
    base: "",
    worktree: "off",
    commit: "atomic",
    unity: "off",
    cli_check: true,
    copy_env: true,
    worker_model: "inherit",
    recon_model: "opus",
    spec_only: false,
    inline_review: false,
    inline_critique: false,
    progress_minutes: String(PROGRESS_MINUTES_DEFAULT),
    progress_format: "output",
    mock_count: String(MOCK_COUNT_DEFAULT),
    mock_hint: false,
    mock_strength: MOCK_STRENGTH_DEFAULT,
    recon_count: "",
    review_passes: String(REVIEW_PASSES_DEFAULT),
    review_minor: false,
    toggles: Object.fromEntries(TOGGLE_ORDER.map((k) => [k, false])) as Record<ToggleKey, boolean>,
    flags: {},
    flag_mode: "embed",
    tab: "task",
    workflow: new Workflow({ name: "untitled" }).toDict(),
    mode: "auto",
    inspector_w: SIDE_W,
  };
}

/** `App.reset`: clears task, notes and every rail setting; keeps the workflow (and its flag choices), theme and width. */
export function resetConfig(cfg: AppConfig): AppConfig {
  const d = appDefaults();
  return { ...d, tab: cfg.tab, workflow: cfg.workflow, flags: cfg.flags, flag_mode: cfg.flag_mode, mode: cfg.mode, inspector_w: cfg.inspector_w };
}

/** Python `int(v)` for the inspector width; null where Python raises TypeError/ValueError. */
function pyInt(v: unknown): number | null {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : null;
  if (v instanceof PyFloat) return Number.isFinite(v.value) ? Math.trunc(v.value) : null;
  if (typeof v === "string") return pyIntParse(v);
  return null;
}

function get(d: Record<string, unknown>, key: string, def: unknown): unknown {
  return Object.prototype.hasOwnProperty.call(d, key) ? d[key] : def;
}

/**
 * `App.load_config`: saved JSON (text or parsed) -> app config. Bad JSON or a non-object
 * gives the defaults. Values are validated and clamped; legacy keys are migrated; a
 * damaged workflow is ignored. Unlike Python, an unknown branch / worktree / commit
 * falls back to the default instead of crashing the prompt build later.
 */
export function loadAppConfig(raw: string | unknown, base: AppConfig = appDefaults()): AppConfig {
  let data: unknown;
  if (typeof raw === "string") {
    try {
      data = pyJsonLoads(raw);
    } catch {
      return base;
    }
  } else data = raw;
  if (!isPlainObject(data)) return base;
  const cfg: AppConfig = { ...base, toggles: { ...base.toggles } };
  const mode = get(data, "mode", "auto");
  cfg.mode = oneOf(THEME_MODES, mode) ? mode : "auto";
  const w = pyInt(get(data, "inspector_w", SIDE_W));
  if (w !== null) cfg.inspector_w = Math.max(INSPECTOR_MIN, Math.min(w, INSPECTOR_MAX));
  const branch = get(data, "branch", cfg.branch);
  if (oneOf(WORKSPACE.branch, branch)) cfg.branch = branch;
  const b = get(data, "base", "");
  cfg.base = typeof b === "string" ? b : pyStr(b);
  const worktree = get(data, "worktree", cfg.worktree);
  if (oneOf(WORKSPACE.worktree, worktree)) cfg.worktree = worktree;
  const commit = get(data, "commit", cfg.commit);
  if (oneOf(WORKSPACE.commit, commit)) cfg.commit = commit;
  const unity = get(data, "unity", cfg.unity);
  if (typeof unity === "string") cfg.unity = unity;
  cfg.cli_check = truthy(get(data, "cli_check", get(data, "mcp_check", true)));
  cfg.copy_env = truthy(get(data, "copy_env", true));
  const wm = get(data, "worker_model", "inherit");
  cfg.worker_model = oneOf(WORKER_MODELS, wm) ? wm : "inherit";
  const rm = get(data, "recon_model", "opus");
  cfg.recon_model = oneOf(RECON_MODELS, rm) ? rm : "opus";
  cfg.spec_only = truthy(get(data, "spec_only", false));
  cfg.inline_review = truthy(get(data, "inline_review", false));
  cfg.inline_critique = truthy(get(data, "inline_critique", false));
  cfg.progress_minutes = fmtNum(positiveInt(data.progress_minutes, PROGRESS_MINUTES_DEFAULT));
  cfg.progress_format = progressFormat(data.progress_format);
  cfg.mock_count = fmtNum(mockCount(get(data, "mock_count", MOCK_COUNT_DEFAULT)));
  cfg.mock_hint = truthy(get(data, "mock_hint", false));
  cfg.mock_strength = mockStrength(get(data, "mock_strength", MOCK_STRENGTH_DEFAULT));
  const cap = reconCount(data.recon_count);
  cfg.recon_count = cap === null ? "" : fmtNum(cap);
  cfg.review_passes = fmtNum(positiveInt(data.review_passes, REVIEW_PASSES_DEFAULT));
  cfg.review_minor = truthy(get(data, "review_minor", false));
  const toggles = migrateToggles(truthy(data.toggles) ? data.toggles : {});
  if (!Array.isArray(toggles)) {
    for (const [k, v] of Object.entries(toggles)) if (oneOf(TOGGLE_ORDER, k)) cfg.toggles[k] = truthy(v);
  }
  const extra = get(data, "extra", "");
  cfg.extra = pyStrip(typeof extra === "string" ? extra : pyStr(extra));
  if (isPlainObject(data.workflow)) {
    try {
      cfg.workflow = new Workflow(data.workflow).toDict();
    } catch {
      // a damaged saved workflow just starts fresh
    }
  }
  cfg.flags = {};
  if (isPlainObject(data.flags)) {
    for (const [k, v] of Object.entries(data.flags)) {
      if (typeof v === "boolean" || typeof v === "string") cfg.flags[k] = v;
    }
  }
  cfg.flag_mode = data.flagMode === "strip" ? "strip" : "embed";
  cfg.tab = data.tab === "stages" ? "stages" : "task";
  return cfg;
}

/** `App.state()`: the dict build_prompt reads (text fields carry Tk's trailing "\n").
 *  promptdraw's additions appear only when set, so a config the Python app could save reads (and
 *  saves) exactly as the Python app's does. */
export function appState(cfg: AppConfig): AnyState {
  const toggles: Record<string, boolean> = { ...cfg.toggles };
  for (const k of Object.keys(EXTRA_TOGGLES)) if (!toggles[k]) delete toggles[k];
  const extra: AnyState = {};
  if (reconCount(cfg.recon_count) !== null) extra.recon_count = cfg.recon_count;
  if (positiveInt(cfg.review_passes, REVIEW_PASSES_DEFAULT) !== REVIEW_PASSES_DEFAULT) extra.review_passes = cfg.review_passes;
  if (cfg.review_minor) extra.review_minor = true;
  // Only choices for flags the workflow still declares, so a stale value never breaks the build.
  const chosen = usableFlags(cleanFlags(cfg.workflow.flags), cfg.flags);
  if (Object.keys(chosen).length) extra.flags = chosen;
  if (cfg.flag_mode === "strip") extra.flagMode = "strip";
  return {
    task: cfg.task + "\n",
    extra: cfg.extra + "\n",
    branch: cfg.branch,
    base: cfg.base,
    worktree: cfg.worktree,
    commit: cfg.commit,
    unity: cfg.unity,
    cli_check: cfg.cli_check,
    copy_env: cfg.copy_env,
    worker_model: cfg.worker_model,
    recon_model: cfg.recon_model,
    spec_only: cfg.spec_only,
    inline_review: cfg.inline_review,
    inline_critique: cfg.inline_critique,
    progress_minutes: cfg.progress_minutes,
    progress_format: cfg.progress_format,
    mock_count: cfg.mock_count,
    mock_hint: cfg.mock_hint,
    mock_strength: cfg.mock_strength,
    ...extra,
    toggles,
    tab: cfg.tab,
    workflow: new Workflow(cfg.workflow).toDict(),
  };
}

/** `App.save_config`: the `.prompt_builder.json` text (state() minus task, plus mode and inspector_w). */
export function serializeAppConfig(cfg: AppConfig): string {
  const data: AnyState = appState(cfg);
  delete data.task;
  data.mode = cfg.mode;
  data.inspector_w = cfg.inspector_w;
  return pyJsonDumps(data, 2, true);
}
