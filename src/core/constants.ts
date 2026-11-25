// The Python app's prompt text and option lists, verbatim. constants.json is generated
// once from the Python modules and checked in; edit it only to track the original.
import raw from "./constants.json";

export type ToggleKey =
  | "assumptions" | "superpowers" | "unity_cli" | "recon" | "workers" | "inline" | "high_confidence"
  | "progress" | "dashboard" | "ui" | "mocks" | "tests" | "android_cdp" | "review" | "review_loop" | "pr";
export type WorkerModel = "inherit" | "fable" | "opus" | "sonnet";
export type ReconModel = "opus" | "sonnet";
export type ProgressFormat = "output" | "json";
export type StageModel = "fable" | "opus" | "sonnet" | "haiku";
export type TemplateKey = "recon" | "architecture_audit" | "ui_critique" | "code_review";
export type Branch = "same" | "new";
export type Worktree = "per_task" | "none";
export type Commit = "atomic" | "combined" | "none";
export type Join = "all" | "first";
export type FeSettingKey =
  | "worker_model" | "recon_model" | "spec_only" | "inline_review" | "inline_critique"
  | "progress_minutes" | "progress_format" | "mock_count" | "mock_hint" | "mock_strength";
/** The Python app's settings plus promptdraw's (EXTRA_SETTINGS). */
export type SettingKey = FeSettingKey | "recon_count" | "review_passes" | "review_minor";

export interface Template {
  name: string;
  hint: string;
  prompt: string;
}

// ---------------------------------------------------------------- promptdraw additions
// Not in the Python app. Each is off or unset by default and then adds nothing, so a config the Python app
// could save still compiles (and saves) byte for byte as the Python app does.

/** The toggles the Python app has, in its order. */
export const FE_TOGGLE_ORDER = raw.TOGGLE_ORDER as ToggleKey[];
/** Toggles promptdraw adds, each after the Python app's toggle it builds on. */
export const EXTRA_TOGGLES: Partial<Record<ToggleKey, ToggleKey>> = { review_loop: "review" };
/** Settings promptdraw adds: Recon's worker cap (empty: not set), the self-loop review's pass cap
 *  and whether it fixes medium and low findings too. */
export const EXTRA_SETTINGS: SettingKey[] = ["recon_count", "review_passes", "review_minor"];
/** Recon workers the board draws while no cap is set. */
export const RECON_COUNT_DEFAULT = 3;
/** The most recon workers a run may fan out to. */
export const RECON_COUNT_MAX = 5;
export const REVIEW_PASSES_DEFAULT = 5;
/** The reward the self-loop review climbs, as its loop pill reads. */
export const REVIEW_LOOP_METRIC = "critical & high fixed %";
/** The self-loop review's reviewer: a fresh subagent on the strongest reviewing model. */
export const REVIEW_MODEL = "opus";
export const REVIEW_MINOR = {
  fix: " Fix medium and low findings in the same passes.",
  list: " Medium and low findings are optional: list them for me at the end and fix only those I ask for.",
} as const;

export const TOGGLE_TEXT = {
  ...(raw.TOGGLE_TEXT as unknown as Record<string, [string, string]>),
  review_loop: [
    "Self-loop code review",
    "Run the code review as an agentic loop with a reward. Each review is a fresh `opus` reviewer subagent, so it judges the work independently; after each review, fix every critical and high finding, then review the diff again. The reward is the share of critical and high findings fixed; stop when it reaches 100% (no critical or high finding left) or after {passes} passes, and report what is still open.{minor}",
  ],
} as unknown as Record<ToggleKey, [label: string, text: string]>;
export const TOGGLE_ORDER: ToggleKey[] = FE_TOGGLE_ORDER.flatMap((k) => [k, ...(Object.keys(EXTRA_TOGGLES) as ToggleKey[]).filter((x) => EXTRA_TOGGLES[x] === k)]);
export const LEGACY_TOGGLES = raw.LEGACY_TOGGLES as Record<string, ToggleKey>;
export const WORKER_MODELS = raw.WORKER_MODELS as WorkerModel[];
export const RECON_MODELS = raw.RECON_MODELS as ReconModel[];
export const SPEC_ONLY: string = raw.SPEC_ONLY;
export const INLINE_KEEP = raw.INLINE_KEEP as Record<"inline_review" | "inline_critique", string>;
export const INLINE_KEEP_LINE: string = raw.INLINE_KEEP_LINE;
export const PROGRESS_MINUTES_DEFAULT: number = raw.PROGRESS_MINUTES_DEFAULT;
export const PROGRESS_FORMATS = raw.PROGRESS_FORMATS as ProgressFormat[];
export const PROGRESS_FORMAT_TEXT = raw.PROGRESS_FORMAT_TEXT as Record<ProgressFormat, string>;
export const MOCK_COUNT_DEFAULT: number = raw.MOCK_COUNT_DEFAULT;
export const MOCK_STRENGTH_DEFAULT: number = raw.MOCK_STRENGTH_DEFAULT;
export const MOCK_STRENGTH_RANGE = raw.MOCK_STRENGTH_RANGE as [lo: number, hi: number];
export const MOCK_HINT: string = raw.MOCK_HINT;
export const WORKER_MODEL_LINE = raw.WORKER_MODEL_LINE as Record<WorkerModel, string>;
export const SETTINGS = raw.SETTINGS as FeSettingKey[];
export const INLINE_OVERRIDES = raw.INLINE_OVERRIDES as ToggleKey[];

export const BRANCH = raw.BRANCH as Record<Branch, string>;
export const BRANCH_WITH_BASE = raw.BRANCH_WITH_BASE as Record<Branch, string>;
export const WORKTREE = raw.WORKTREE as Record<Worktree, string>;
export const WORKTREE_COPY_ENV: string = raw.WORKTREE_COPY_ENV;
export const COMMIT = raw.COMMIT as Record<Commit, string>;
export const UNITY_SPAWN: string = raw.UNITY_SPAWN;
export const UNITY_EXISTING: string = raw.UNITY_EXISTING;
export const UNITY_INSTANCE_CHECK: string = raw.UNITY_INSTANCE_CHECK;
export const LEGACY_KEYS = raw.LEGACY_KEYS as Record<string, string>;

export const TEMPLATES = raw.TEMPLATES as Record<TemplateKey, Template>;
export const STAGE_MODELS = raw.STAGE_MODELS as StageModel[];
export const ON_CANCEL_HEAD: string = raw.ON_CANCEL_HEAD;
export const READ_ONLY_NOTE: string = raw.READ_ONLY_NOTE;
export const JOINS = raw.JOINS as Join[];
export const WORKSPACE = raw.WORKSPACE as { branch: Branch[]; worktree: Worktree[]; commit: Commit[]; base: null };
export const ON_CANCEL_GRACE: number = raw.ON_CANCEL_GRACE;
export const LOOP_DEFAULTS = raw.LOOP_DEFAULTS as {
  agentic: boolean; mode: "count" | "reward"; count: number; reward: string; metric: string; target: number; max_passes: number;
};
export const DEFAULT_STATE = raw.DEFAULT_STATE as {
  task: string; extra: string; branch: Branch; base: string; worktree: Worktree; commit: Commit;
  unity: string; cli_check: boolean; copy_env: boolean; toggles: Record<string, boolean>;
};
export const LETTERS: string = raw.LETTERS;
export const FUNCTIONS_HEAD: string = raw.FUNCTIONS_HEAD;

/** `list.__contains__` for a constant list, with a type guard. */
export function oneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

/** `key in dict` for a constant record. */
export function hasKey<K extends string>(rec: Record<K, unknown>, v: unknown): v is K {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(rec, v);
}
