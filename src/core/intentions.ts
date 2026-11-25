// Port of the Python app's intentions.py: the "how to work" toggles shared by the Task tab
// rail and a workflow's intentions block. Pure data and text.
// @lat: [[core#Modules]]
import {
  EXTRA_TOGGLES,
  INLINE_KEEP,
  INLINE_KEEP_LINE,
  INLINE_OVERRIDES,
  LEGACY_TOGGLES,
  MOCK_COUNT_DEFAULT,
  MOCK_HINT,
  MOCK_STRENGTH_DEFAULT,
  MOCK_STRENGTH_RANGE,
  PROGRESS_FORMAT_TEXT,
  PROGRESS_FORMATS,
  PROGRESS_MINUTES_DEFAULT,
  RECON_COUNT_MAX,
  RECON_MODELS,
  REVIEW_MINOR,
  REVIEW_PASSES_DEFAULT,
  SPEC_ONLY,
  TOGGLE_ORDER,
  TOGGLE_TEXT,
  WORKER_MODEL_LINE,
  WORKER_MODELS,
  hasKey,
  oneOf,
  type ProgressFormat,
  type ReconModel,
  type ToggleKey,
  type WorkerModel,
} from "./constants";
import { PyFloat, fmtNum, isPlainObject, pyFloatParse, pyIntParse, pyStr, roundHalfEven, truthy } from "./py";

export type AnyState = Record<string, unknown>;
/** Toggles as the Python app stores them: a dict of key -> on, or a list of keys that are on. */
export type Toggles = Record<string, unknown> | string[];

export interface IntentionsSettings {
  toggles: ToggleKey[];
  worker_model: WorkerModel;
  recon_model: ReconModel;
  spec_only: boolean;
  inline_review: boolean;
  inline_critique: boolean;
  progress_minutes: number;
  progress_format: ProgressFormat;
  mock_count: number;
  mock_hint: boolean;
  mock_strength: number;
}

/** `block_state`: the settings with toggles as a dict over every TOGGLE_ORDER key. */
export type IntentionsState = Omit<IntentionsSettings, "toggles"> & { toggles: Record<ToggleKey, boolean> };

/** Python `str.format` for named fields whose values are plain text. */
export function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? (values[k] as string) : m));
}

function get(state: AnyState, key: string, def: unknown): unknown {
  return Object.prototype.hasOwnProperty.call(state, key) ? state[key] : def;
}

/** `toggle_line`: (label, text) for a toggle, with its placeholders filled in. */
export function toggleLine(key: ToggleKey, state: AnyState): [label: string, text: string] {
  const [label, raw] = TOGGLE_TEXT[key];
  let text = raw;
  if (key === "workers") {
    const model = get(state, "worker_model", WORKER_MODELS[0]);
    text = fill(text, { model_line: hasKey(WORKER_MODEL_LINE, model) ? WORKER_MODEL_LINE[model] : WORKER_MODEL_LINE.inherit });
  } else if (key === "recon") {
    const model = get(state, "recon_model", RECON_MODELS[0]);
    text = fill(text, { model: oneOf(RECON_MODELS, model) ? model : "opus" });
    // promptdraw: a cap on the recon workers, when one is set; unset keeps the Python app's "several".
    const cap = reconCount(state.recon_count);
    if (cap !== null) text = text.replace("to several parallel worker subagents", `to at most ${cap} parallel worker subagents`);
  } else if (key === "review_loop") {
    text = fill(text, {
      passes: fmtNum(positiveInt(state.review_passes, REVIEW_PASSES_DEFAULT)),
      minor: truthy(state.review_minor) ? REVIEW_MINOR.fix : REVIEW_MINOR.list,
    });
  } else if (key === "superpowers") {
    text = fill(text, { spec_only: truthy(state.spec_only) ? SPEC_ONLY : "" });
  } else if (key === "inline") {
    const jobs = (Object.keys(INLINE_KEEP) as (keyof typeof INLINE_KEEP)[])
      .filter((k) => truthy(state[k]))
      .map((k) => INLINE_KEEP[k]);
    text = fill(text, { keep: jobs.length ? fill(INLINE_KEEP_LINE, { jobs: jobs.join(" and ") }) : "" });
  } else if (key === "progress") {
    text = fill(text, {
      minutes: fmtNum(positiveInt(state.progress_minutes, PROGRESS_MINUTES_DEFAULT)),
      format: PROGRESS_FORMAT_TEXT[progressFormat(state.progress_format)],
    });
  } else if (key === "mocks") {
    const hint = truthy(state.mock_hint) ? fill(MOCK_HINT, { strength: fmtNum(mockStrength(state.mock_strength)) }) : "";
    text = fill(text, { count: fmtNum(mockCount(state.mock_count)), hint });
  }
  return [label, text];
}

/** `positive_int`: `int(str(value).strip())` when > 0, else the default (text-field semantics). */
export function positiveInt(value: unknown, def: number): number {
  const n = pyIntParse(pyStr(value === undefined ? null : value));
  return n !== null && n > 0 ? n : def;
}

/** promptdraw: Recon's worker cap (at most RECON_COUNT_MAX), or null while it is not set (or not
 *  a positive number). */
export function reconCount(value: unknown): number | null {
  const n = pyIntParse(pyStr(value === undefined ? null : value));
  return n !== null && n > 0 ? Math.min(n, RECON_COUNT_MAX) : null;
}

export function progressFormat(value: unknown): ProgressFormat {
  return oneOf(PROGRESS_FORMATS, value) ? value : "output";
}

export function mockCount(value: unknown): number {
  return positiveInt(value, MOCK_COUNT_DEFAULT);
}

/**
 * `mock_strength`: `int(round(float(value)))` clamped to 1..100, 30 on bad input.
 * Python raises OverflowError on infinity; here it clamps instead.
 */
export function mockStrength(value: unknown): number {
  const [lo, hi] = MOCK_STRENGTH_RANGE;
  let f: number | null;
  if (typeof value === "boolean") f = value ? 1 : 0;
  else if (typeof value === "number") f = value;
  else if (value instanceof PyFloat) f = value.value;
  else if (typeof value === "string") f = pyFloatParse(value);
  else f = null;
  if (f === null || Number.isNaN(f)) return MOCK_STRENGTH_DEFAULT;
  if (!Number.isFinite(f)) return f > 0 ? hi : lo;
  return Math.max(lo, Math.min(hi, roundHalfEven(f)));
}

/** `migrate_toggles`: legacy keys renamed; a current key wins over its alias. */
export function migrateToggles(toggles: unknown): Toggles {
  if (isPlainObject(toggles)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(toggles)) if (hasKey(LEGACY_TOGGLES, k)) out[LEGACY_TOGGLES[k] as string] = v;
    for (const [k, v] of Object.entries(toggles)) if (!hasKey(LEGACY_TOGGLES, k)) out[k] = v;
    return out;
  }
  const list: unknown[] = !truthy(toggles)
    ? []
    : Array.isArray(toggles)
      ? toggles
      : typeof toggles === "string"
        ? Array.from(toggles)
        : [];
  const out: string[] = [];
  for (const k of list) {
    const key = typeof k === "string" && hasKey(LEGACY_TOGGLES, k) ? LEGACY_TOGGLES[k] : k;
    if (typeof key === "string" && !out.includes(key)) out.push(key);
  }
  return out;
}

function onKeys(toggles: Toggles): ToggleKey[] {
  return TOGGLE_ORDER.filter((k) =>
    Array.isArray(toggles) ? toggles.includes(k) : truthy(Object.prototype.hasOwnProperty.call(toggles, k) ? toggles[k] : null),
  );
}

/** `block_settings`: app state -> the fields an intentions block stores, cleaned up. */
export function blockSettings(state: AnyState): IntentionsSettings {
  const toggles = migrateToggles(state.toggles);
  return {
    toggles: onKeys(toggles),
    worker_model: oneOf(WORKER_MODELS, state.worker_model) ? state.worker_model : "inherit",
    recon_model: oneOf(RECON_MODELS, state.recon_model) ? state.recon_model : "opus",
    spec_only: truthy(state.spec_only),
    inline_review: truthy(state.inline_review),
    inline_critique: truthy(state.inline_critique),
    progress_minutes: positiveInt(state.progress_minutes, PROGRESS_MINUTES_DEFAULT),
    progress_format: progressFormat(state.progress_format),
    mock_count: mockCount(state.mock_count),
    mock_hint: truthy(state.mock_hint),
    mock_strength: mockStrength(state.mock_strength),
  };
}

/** `block_state`: intentions block -> the state fields build_prompt reads. */
export function blockState(b: AnyState): IntentionsState {
  const s = blockSettings(b);
  const toggles = Object.fromEntries(TOGGLE_ORDER.map((k) => [k, s.toggles.includes(k)])) as Record<ToggleKey, boolean>;
  return { ...s, toggles };
}

/** `active_toggles`: toggles that reach the prompt. Recon needs workers; inline drops both.
 *  promptdraw's additions need the toggle they build on (the self-loop review, the review). */
export function activeToggles(toggles: unknown): ToggleKey[] {
  const on = onKeys(migrateToggles(toggles));
  return on.filter(
    (k) =>
      !(k === "recon" && !on.includes("workers")) &&
      !(on.includes("inline") && INLINE_OVERRIDES.includes(k)) &&
      !(EXTRA_TOGGLES[k] && !on.includes(EXTRA_TOGGLES[k])),
  );
}

/** `summary`: labels of the toggles a block has on that reach the prompt. */
export function summary(b: AnyState): string[] {
  return activeToggles(blockSettings(b).toggles).map((k) => TOGGLE_TEXT[k][0]);
}
