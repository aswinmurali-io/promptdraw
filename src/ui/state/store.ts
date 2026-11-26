// App state for the prompt builder UI: the Python app's AppConfig plus an undo/redo history of
// snapshots. Pure reducer (no DOM) so every edit path is unit-testable.
// @lat: [[ui#State]]
import { useCallback, useReducer } from "react";
import { DROPS_WITH } from "../lib/rules";
import {
  appDefaults,
  resetConfig,
  type AppConfig,
  type Branch,
  type Commit,
  type ToggleKey,
  type Workspace,
  type Worktree,
} from "../../core";

/** How many snapshots undo keeps. */
export const HISTORY_LIMIT = 100;
/** Edits to the same field within this window merge into one undo step (typing). */
export const COALESCE_MS = 1000;

export interface UiState {
  cfg: AppConfig;
  past: AppConfig[];
  future: AppConfig[];
  /** Coalesce key and time of the last recorded edit. */
  lastKey: string | null;
  lastAt: number;
}

export type StoreAction =
  /** Merge a patch. `coalesce` merges rapid edits of one field; `record: false` skips history. */
  | { type: "set"; patch: Partial<AppConfig>; coalesce?: string; record?: boolean; at?: number }
  | { type: "toggle"; key: ToggleKey; on: boolean }
  | { type: "workspace"; key: keyof Workspace; value: string; coalesce?: string; at?: number }
  /** Swap in a whole config (import); undoable. */
  | { type: "replace"; cfg: AppConfig }
  /** The Python app Reset: clear task, notes and every rail setting; keep the workflow and theme. */
  /** `workflow`: Menu → Reset also clears the open workflow and its flag choices. */
  | { type: "reset"; workflow?: boolean }
  /** Another tab saved `cfg`: take it as one undoable step, keeping this tab's view and theme. */
  | { type: "external"; cfg: AppConfig }
  | { type: "undo" }
  | { type: "redo" };

export function initialState(cfg: AppConfig = appDefaults()): UiState {
  return { cfg, past: [], future: [], lastKey: null, lastAt: 0 };
}

export type WorkspaceKey = keyof Workspace;
export const WORKSPACE_KEYS: WorkspaceKey[] = ["branch", "worktree", "commit", "base"];

/** Values the rail shows: on the Stages tab the workflow's pins win (the Python app `show_pinned`). */
export function effectiveWorkspace(cfg: AppConfig): { branch: Branch; worktree: Worktree; commit: Commit; base: string } {
  const own = { branch: cfg.branch, worktree: cfg.worktree, commit: cfg.commit, base: cfg.base };
  if (cfg.tab !== "stages") return own;
  return { ...own, ...cfg.workflow.workspace } as typeof own;
}

/** Which workspace keys the current workflow pins (only meaningful on the Stages tab). */
export function pinnedKeys(cfg: AppConfig): Set<WorkspaceKey> {
  if (cfg.tab !== "stages") return new Set();
  return new Set(WORKSPACE_KEYS.filter((k) => k in cfg.workflow.workspace));
}

/**
 * Edit a workspace setting the way the Python app does: the rail value always changes, and on the
 * Stages tab a key the workflow already pins edits the pin (the Python app `_pin`): stripped, and a
 * blank value removes it.
 */
export function editWorkspace(cfg: AppConfig, key: WorkspaceKey, value: string): AppConfig {
  const next = { ...cfg, [key]: value } as AppConfig;
  if (cfg.tab === "stages" && key in cfg.workflow.workspace) {
    const workspace: Workspace = { ...cfg.workflow.workspace };
    const v = value.trim();
    if (v) (workspace as Record<string, string>)[key] = v;
    else delete workspace[key];
    next.workflow = { ...cfg.workflow, workspace };
  }
  return next;
}

function record(state: UiState, cfg: AppConfig, key: string | null, at: number): UiState {
  if (cfg === state.cfg) return state;
  const merge = key !== null && key === state.lastKey && at - state.lastAt < COALESCE_MS;
  const past = merge ? state.past : [...state.past, state.cfg].slice(-HISTORY_LIMIT);
  return { cfg, past, future: [], lastKey: key, lastAt: at };
}

export function reducer(state: UiState, action: StoreAction): UiState {
  switch (action.type) {
    case "set": {
      const cfg = { ...state.cfg, ...action.patch };
      if (action.record === false) return { ...state, cfg };
      return record(state, cfg, action.coalesce ?? null, action.at ?? Date.now());
    }
    case "toggle": {
      if (state.cfg.toggles[action.key] === action.on) return state;
      const toggles = { ...state.cfg.toggles, [action.key]: action.on };
      if (!action.on) for (const k of DROPS_WITH[action.key] ?? []) toggles[k] = false;
      const cfg = { ...state.cfg, toggles };
      return record(state, cfg, null, Date.now());
    }
    case "workspace":
      return record(state, editWorkspace(state.cfg, action.key, action.value), action.coalesce ?? null, action.at ?? Date.now());
    case "replace":
      return record(state, action.cfg, null, Date.now());
    case "reset": {
      const cfg = { ...resetConfig(state.cfg), mode: state.cfg.mode };
      if (action.workflow) {
        const d = appDefaults();
        Object.assign(cfg, { workflow: d.workflow, flags: d.flags, flag_mode: d.flag_mode });
      }
      return record(state, cfg, null, Date.now());
    }
    case "external":
      return record(state, { ...action.cfg, tab: state.cfg.tab, mode: state.cfg.mode }, null, Date.now());
    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      // Theme is a preference, not an edit: keep the current one across undo.
      return { cfg: { ...prev, mode: state.cfg.mode }, past: state.past.slice(0, -1), future: [state.cfg, ...state.future], lastKey: null, lastAt: 0 };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return { cfg: { ...next, mode: state.cfg.mode }, past: [...state.past, state.cfg], future: state.future.slice(1), lastKey: null, lastAt: 0 };
    }
  }
}

export interface Store {
  state: UiState;
  dispatch: (a: StoreAction) => void;
  /** Shorthand for `set` with a coalesce key per field. */
  set: (patch: Partial<AppConfig>, coalesce?: string) => void;
}

export function useStore(init: () => AppConfig): Store {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(init()));
  const set = useCallback((patch: Partial<AppConfig>, coalesce?: string) => dispatch({ type: "set", patch, coalesce }), []);
  return { state, dispatch, set };
}
