// Port of the Python app's compile.py: build_prompt, config load/migrate, with_intentions,
// compile_workflow and the CLI's argument handling (as pure functions).
// @lat: [[core#Prompt compilation]]
import {
  BRANCH,
  BRANCH_WITH_BASE,
  COMMIT,
  DEFAULT_STATE,
  EXTRA_SETTINGS,
  LEGACY_KEYS,
  SETTINGS,
  TOGGLE_ORDER,
  UNITY_EXISTING,
  UNITY_INSTANCE_CHECK,
  UNITY_SPAWN,
  WORKSPACE,
  WORKTREE,
  WORKTREE_COPY_ENV,
  hasKey,
  type SettingKey,
  type ToggleKey,
} from "./constants";
import { resolveFlagsDict, type FlagMode, type FlagValues } from "./flags";
import { activeToggles, blockState, fill, migrateToggles, toggleLine, type AnyState } from "./intentions";
import { isPlainObject, pyJsonLoads, pyRepr, pySplit, pyStr, pyStrip, truthy } from "./py";
import { Workflow, cleanWorkspace, stripLetters, workflowPrompt, type Block } from "./workflow";

export { DEFAULT_STATE };
export type PromptState = AnyState;
export type BuildResult = [prompt: string, sections: string[]];

/** Python `state[key]`: a missing key is a KeyError. */
function need(state: AnyState, key: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(state, key)) throw new Error(`KeyError: ${pyRepr(key)}`);
  return state[key];
}

function pick<T extends string>(rec: Record<T, string>, key: unknown, name: string): string {
  if (!hasKey(rec, key)) throw new Error(`KeyError: ${pyRepr(key)} (${name})`);
  return rec[key];
}

function textOf(v: unknown): string {
  return typeof v === "string" ? v : pyStr(v);
}

function getOr(state: AnyState, key: string, def: unknown): unknown {
  return Object.prototype.hasOwnProperty.call(state, key) ? state[key] : def;
}

/**
 * `build_prompt`: state -> [prompt, section names]. Throws where Python raises KeyError
 * (a missing required key, or an unknown branch / worktree / commit value).
 */
export function buildPrompt(stateIn: AnyState): BuildResult {
  let state: AnyState = stateIn;
  const parts: string[] = [];
  const sections: string[] = [];

  if (state.tab === "stages") {
    const raw = new Workflow(state.workflow);
    const dict = raw.toDict();
    const resolved = resolveFlagsDict(dict, state.flags as FlagValues | undefined, (state.flagMode as FlagMode | undefined) ?? "embed");
    const wf = resolved === dict ? raw : new Workflow(resolved);
    state = { ...state, ...wf.workspace };
    parts.push(workflowPrompt(wf));
    const steps = new Set(Object.values(wf.stageNumbers()).map(stripLetters)).size;
    sections.push(steps ? `workflow ${steps} steps` : "workflow");
    const ib = wf.intentions();
    state = ib ? { ...state, ...blockState(ib) } : { ...state, toggles: {} };
  } else {
    const task = pyStrip(textOf(need(state, "task")));
    parts.push("## Task\n\n" + (task ? task : "<describe the task here>"));
    sections.push("task");
  }

  const base = pyStrip(textOf(need(state, "base")));
  const branch = need(state, "branch");
  const worktree = need(state, "worktree");
  const workspace: string[] = [];
  if (base) workspace.push(fill(pick(BRANCH_WITH_BASE, branch, "branch"), { base }));
  else workspace.push(pick(BRANCH, branch, "branch"));
  workspace.push(pick(WORKTREE, worktree, "worktree"));
  if (worktree === "per_task" && truthy(getOr(state, "copy_env", true))) workspace.push(WORKTREE_COPY_ENV);
  workspace.push(pick(COMMIT, need(state, "commit"), "commit"));
  parts.push("## Workspace & git\n\n" + workspace.map((l) => "- " + l).join("\n"));
  sections.push("git");

  const unity = [need(state, "unity") === "spawn" ? UNITY_SPAWN : UNITY_EXISTING];
  const cliCheck = truthy(getOr(state, "cli_check", getOr(state, "mcp_check", true)));
  if (cliCheck) unity.push(UNITY_INSTANCE_CHECK);
  parts.push("## Unity\n\n" + unity.map((l) => "- " + l).join("\n"));
  sections.push(cliCheck ? "unity +1" : "unity");

  const on = activeToggles(need(state, "toggles"));
  if (on.length) {
    const lines = on.map((key) => {
      const [label, text] = toggleLine(key, state);
      return `- **${label}** — ${text}`;
    });
    parts.push("## How to work\n\n" + lines.join("\n"));
    sections.push(`how to work +${on.length}`);
  }

  const extra = pyStrip(textOf(need(state, "extra")));
  if (extra && state.tab !== "stages") {
    parts.push("## Extra notes\n\n" + extra);
    sections.push("notes");
  }
  return [parts.join("\n\n") + "\n", sections];
}

// ---------------------------------------------------------------- config

/** `migrate_state`: renamed keys moved to their current names (the current name wins). */
export function migrateState(saved: AnyState): AnyState {
  const out: AnyState = { ...saved };
  for (const [oldKey, newKey] of Object.entries(LEGACY_KEYS)) {
    if (Object.prototype.hasOwnProperty.call(out, oldKey)) {
      const v = out[oldKey];
      delete out[oldKey];
      if (!Object.prototype.hasOwnProperty.call(out, newKey)) out[newKey] = v;
    }
  }
  if (Object.prototype.hasOwnProperty.call(out, "toggles")) out.toggles = migrateToggles(out.toggles);
  return out;
}

/**
 * `load_config`: the saved Prompt Builder state (JSON text or an already-parsed value),
 * or the defaults. Keeps only DEFAULT_STATE and SETTINGS keys, like the CLI does.
 */
export function loadConfig(raw?: string | unknown): AnyState {
  let saved: unknown = {};
  if (typeof raw === "string") {
    try {
      saved = pyJsonLoads(raw);
    } catch {
      saved = {};
    }
  } else if (raw !== undefined) saved = raw;
  const s = isPlainObject(saved) ? migrateState(saved) : {};
  const out: AnyState = { ...structuredClone(DEFAULT_STATE) };
  for (const [k, v] of Object.entries(s)) {
    if (k in DEFAULT_STATE || (SETTINGS as string[]).includes(k) || (EXTRA_SETTINGS as string[]).includes(k)) out[k] = v;
  }
  return out;
}

/**
 * `with_intentions`: a copy of wf whose intentions block has `on` added, `off` removed
 * and `settings` set. A workflow without an intentions block gets one at the top.
 */
export function withIntentions(
  wf: Workflow,
  on: string[] = [],
  off: string[] = [],
  settings: Partial<Record<SettingKey, unknown>> = {},
): Workflow {
  const data = wf.toDict();
  let block = data.blocks.find((b) => b.type === "intentions") as Block | undefined;
  if (!block) {
    block = { id: "intentions", type: "intentions", toggles: [] };
    data.blocks.unshift(block);
  }
  const onM = migrateToggles([...on]) as string[];
  const offM = migrateToggles([...off]) as string[];
  const current = migrateToggles(Object.prototype.hasOwnProperty.call(block, "toggles") ? block.toggles : []);
  const toggles = (Array.isArray(current) ? current : Object.keys(current)).filter((k) => !offM.includes(k));
  for (const k of onM) if (!toggles.includes(k)) toggles.push(k);
  Object.assign(block, settings, { toggles: TOGGLE_ORDER.filter((k) => toggles.includes(k)) });
  return new Workflow(data);
}

/**
 * `compile_workflow`: workflow -> [prompt, sections], from the config (default: the
 * defaults) plus state overrides (base, branch, worktree, commit, unity, cli_check, …).
 */
export function compileWorkflow(wfIn: Workflow, config?: AnyState | null, overrides: AnyState = {}, flags?: FlagValues, flagMode?: FlagMode): BuildResult {
  let wf = wfIn;
  const pinnedIn: AnyState = {};
  for (const [k, v] of Object.entries(overrides)) if (k in WORKSPACE) pinnedIn[k] = v;
  const pinned = cleanWorkspace(pinnedIn);
  if (Object.keys(pinned).length) wf = new Workflow({ ...wf.toDict(), workspace: { ...wf.workspace, ...pinned } });
  const full = { ...(config ?? loadConfig()), ...migrateState(overrides) };
  return buildPrompt({ ...full, tab: "stages", workflow: wf.toDict(), ...(flags ? { flags } : {}), ...(flagMode ? { flagMode } : {}) });
}

// ---------------------------------------------------------------- CLI (pure)

export class CliError extends Error {}

export interface CliOptions {
  workflow: string;
  out?: string;
  base?: string;
  branch?: "same" | "new";
  on: string[];
  off: string[];
  set: string[];
  /** Prompt flag values (flags.ts); a flag not named keeps its declared default. */
  flags?: FlagValues;
  /** `embed` (the default) keeps every variant labelled and marks the chosen one; `strip` removes the others. */
  flagMode?: FlagMode;
}

/** `--set KEY=VALUE`: booleans arrive as text. */
export function parseSetValue(value: string): boolean | string {
  const low = pyStrip(value).toLowerCase();
  if (["true", "yes", "on", "1"].includes(low)) return true;
  if (["false", "no", "off", "0"].includes(low)) return false;
  return value;
}

/** The CLI's validation of --on/--off/--set (argparse errors as CliError). */
export function cliSettings(opts: CliOptions): { on: ToggleKey[]; off: ToggleKey[]; settings: Partial<Record<SettingKey, unknown>> } {
  const on = migrateToggles(opts.on) as string[];
  const off = migrateToggles(opts.off) as string[];
  const bad = [...on, ...off].filter((k) => !(TOGGLE_ORDER as string[]).includes(k));
  if (bad.length) throw new CliError(`unknown toggle(s): ${bad.join(", ")} (choose from ${TOGGLE_ORDER.join(", ")})`);
  const settings: Partial<Record<SettingKey, unknown>> = {};
  for (const kv of opts.set) {
    const at = kv.indexOf("=");
    const key = at < 0 ? kv : kv.slice(0, at);
    if (at < 0 || !(SETTINGS as string[]).includes(key)) {
      throw new CliError("--set takes KEY=VALUE with KEY one of: " + SETTINGS.join(", "));
    }
    settings[key as SettingKey] = parseSetValue(kv.slice(at + 1));
  }
  return { on: on as ToggleKey[], off: off as ToggleKey[], settings };
}

/**
 * What `python3 compile.py …` prints, without touching files: the prompt, its sections,
 * and the stderr summary line `-o` writes.
 */
export function cliCompile(opts: CliOptions, wf: Workflow, config?: AnyState | null): {
  text: string;
  sections: string[];
  summary: string;
} {
  const { on, off, settings } = cliSettings(opts);
  let w = wf;
  if (on.length || off.length || Object.keys(settings).length) w = withIntentions(w, on, off, settings);
  const overrides: AnyState = {};
  if (opts.base !== undefined) overrides.base = opts.base;
  if (opts.branch !== undefined) overrides.branch = opts.branch;
  const [text, sections] = compileWorkflow(w, config, overrides, opts.flags, opts.flagMode);
  const lines = text.split("\n").length - 1;
  return { text, sections, summary: `${opts.out ?? "-"}: ${lines} lines · ${sections.join(", ")}` };
}

/** Shell-quote one argument (POSIX sh). */
export function shellQuote(s: string): string {
  return /^[A-Za-z0-9_./=:@%+-]+$/.test(s) ? s : "'" + s.replace(/'/g, "'\\''") + "'";
}

/** The `python3 compile.py …` command line for these options, to copy and run by hand. */
export function compileCommand(opts: CliOptions, script = "compile.py"): string {
  const args = ["python3", script, opts.workflow];
  if (opts.out) args.push("-o", opts.out);
  if (opts.base !== undefined) args.push("--base", opts.base);
  if (opts.branch) args.push("--branch", opts.branch);
  for (const t of opts.on) args.push("--on", t);
  for (const t of opts.off) args.push("--off", t);
  for (const s of opts.set) args.push("--set", s);
  return args.map(shellQuote).join(" ");
}

/** The macOS dark-mode probe the Python app shells out to (the web app uses prefers-color-scheme). */
export const DARK_MODE_COMMAND = "defaults read -g AppleInterfaceStyle";

/** The Python app's reading of that command's output. */
export function isDarkFromDefaults(stdout: string): boolean {
  return pyStrip(stdout).toLowerCase().includes("dark");
}

/** `"{lines} lines · {words} words"` meta line under the prompt. */
export function promptMeta(text: string): string {
  return `${text.split("\n").length - 1} lines · ${pySplit(text).length} words`;
}

/** What Copy puts on the clipboard: the text with trailing newlines removed. */
export function copyText(text: string): string {
  return text.replace(/\n+$/, "");
}

