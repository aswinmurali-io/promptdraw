// How the "How to work" options are grouped for display (the panel's runs, the board's lanes).
// Display only: the prompt keeps the Python app's TOGGLE_ORDER.
// @lat: [[ui#Canvas#How to work panel]]
import { TOGGLE_ORDER, toggleLine, type AnyState, type ToggleKey } from "../../core";
import { INTENT_SUMMARY } from "./intentSummaries";
import { TOGGLE_NEEDS, toggleBlocked } from "./rules";

/** The options in five short runs under small headings, so the eye finds the kind of option
 *  first. Display only: the prompt keeps the Python app's TOGGLE_ORDER. */
export const INTENT_GROUPS: [title: string, keys: ToggleKey[]][] = [
  ["Before starting", ["assumptions", "superpowers", "unity_cli"]],
  ["Agents", ["workers", "recon", "inline"]],
  ["How to build", ["high_confidence", "ui", "mocks"]],
  ["Checks", ["tests", "android_cdp", "review", "review_loop"]],
  ["Report back", ["progress", "dashboard", "pr"]],
];

/** Toggles whose extra settings (model, minutes, count…) live in the Settings panel. */
export const HAS_OPTIONS: ReadonlySet<ToggleKey> = new Set<ToggleKey>(["superpowers", "workers", "recon", "inline", "progress", "mocks", "review_loop"]);

/** INTENT_GROUPS (keys the core no longer has dropped), with any toggle the groups miss in a
 *  last "More" group, so a new toggle in the core always shows. */
export function intentGroups(): [string, ToggleKey[]][] {
  const seen = new Set(INTENT_GROUPS.flatMap(([, k]) => k));
  const out = INTENT_GROUPS.map(([t, keys]) => [t, keys.filter((k) => TOGGLE_ORDER.includes(k))] as [string, ToggleKey[]]);
  const rest = TOGGLE_ORDER.filter((k) => !seen.has(k));
  return rest.length ? [...out, ["More", rest]] : out;
}

/** Ticked options in panel order, with the run each comes from. */
export function activeLanes(toggles: Record<ToggleKey, boolean>): [group: string, key: ToggleKey][] {
  return intentGroups().flatMap(([g, keys]) => keys.filter((k) => toggles[k]).map((k) => [g, k] as [string, ToggleKey]));
}


export interface LaneNode {
  group: string;
  key: ToggleKey;
  /** Why it does not run (locked by another option), or null when it runs. */
  locked: string | null;
}

/**
 * The ticked options as rows of the board's parallel group. An option that needs another
 * (TOGGLE_NEEDS) follows it in that one's row, Progress reports → Basic dashboard, so the board
 * reads as a chain; with what it needs not ticked it starts a row of its own, locked. Rows keep
 * the panel's order.
 */
export function laneRows(toggles: Record<ToggleKey, boolean>): LaneNode[][] {
  const lanes = activeLanes(toggles);
  const rows: LaneNode[][] = [];
  const rowOf = new Map<ToggleKey, LaneNode[]>();
  const ticked = new Set(lanes.map(([, k]) => k));
  const place = (group: string, key: ToggleKey) => {
    if (rowOf.has(key)) return;
    const need = TOGGLE_NEEDS[key];
    const node: LaneNode = { group, key, locked: toggleBlocked(key, toggles) };
    if (need && ticked.has(need)) {
      const g = lanes.find(([, k]) => k === need)![0];
      place(g, need);
      const row = rowOf.get(need)!;
      row.push(node);
      rowOf.set(key, row);
      return;
    }
    const row = [node];
    rows.push(row);
    rowOf.set(key, row);
  };
  for (const [g, k] of lanes) place(g, k);
  return rows;
}

/** The groups and rows whose name, summary, prompt line or group title hold every word typed. */
export function filterGroups(query: string, state: AnyState): [string, ToggleKey[]][] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return intentGroups();
  return intentGroups()
    .map(([title, keys]): [string, ToggleKey[]] => [
      title,
      keys.filter((k) => {
        const hay = [title, ...toggleLine(k, state), INTENT_SUMMARY[k] ?? ""].join(" ").toLowerCase();
        return words.every((w) => hay.includes(w));
      }),
    ])
    .filter(([, keys]) => keys.length);
}

