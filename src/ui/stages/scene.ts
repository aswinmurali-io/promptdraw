// The stage canvas scene: The Python app's automatic layout (core `layout()`) measured with the
// canvas fonts, plus the pure lookups the editor needs on top of it (drop targets, bounds,
// stable rough.js seeds). No React here.
// @lat: [[stages#Canvas]]
import { CARD_W, TEXT_X, Workflow, inlineStates, layout, variantStates, wrap, type Box, type FlagMode, type FlagValues, type InlineInfo, type Layout, type TextLines, type TextMode, type VariantInfo, type WorkflowDict } from "../../core";
import type { StageFocus } from "./edits";

/** Canvas fonts (hand-drawn content voice). Sizes are world pixels and fit the Python app's geometry;
 *  nothing is under 12px, the app's type floor, at 100%. */
export const FONTS = {
  name: '700 16px "Kalam", "Comic Sans MS", cursive',
  body: '700 13px "Kalam", "Comic Sans MS", cursive',
  goal: '700 14px "Kalam", "Comic Sans MS", cursive',
  mono: '500 12px "Cascadia Code", "JetBrains Mono", ui-monospace, Menlo, monospace',
  kind: '700 12px "Assistant", system-ui, sans-serif',
  tag: '700 12px "Cascadia Code", ui-monospace, Menlo, monospace',
  pill: '700 12px "Assistant", system-ui, sans-serif',
} as const;

export type FontKey = keyof typeof FONTS;

/** Average glyph width as a share of the font size, for environments without canvas text. */
const APPROX: Record<FontKey, number> = { name: 0.56, body: 0.5, goal: 0.5, mono: 0.62, kind: 0.62, tag: 0.62, pill: 0.55 };
const SIZE: Record<FontKey, number> = { name: 16, body: 13, goal: 14, mono: 12, kind: 12, tag: 12, pill: 12 };

type Ctx = { font: string; measureText: (t: string) => { width: number } };
let ctx: Ctx | null | undefined;

function context(): Ctx | null {
  if (ctx !== undefined) return ctx;
  ctx = null;
  try {
    if (typeof OffscreenCanvas !== "undefined") ctx = new OffscreenCanvas(1, 1).getContext("2d") as unknown as Ctx | null;
  } catch {
    ctx = null;
  }
  return ctx;
}

const widths = new Map<string, number>();

/** Width of `text` in world pixels for one of the canvas fonts. */
export function measure(font: FontKey, text: string): number {
  const key = font + "\u0000" + text;
  const hit = widths.get(key);
  if (hit !== undefined) return hit;
  const c = context();
  let w: number;
  if (c) {
    c.font = FONTS[font];
    w = c.measureText(text).width;
  } else w = Array.from(text).length * SIZE[font] * APPROX[font];
  if (widths.size > 20000) widths.clear();
  widths.set(key, w);
  return w;
}

/** Forget cached widths (after the web fonts finish loading). */
export function resetMeasure(): void {
  widths.clear();
}

const MODE_FONT: Record<TextMode, FontKey> = { goal: "goal", body: "body", mono: "mono" };

/** `_text_lines`: wrap with the font each card body uses. */
export const textLines: TextLines = (text, mode, width, maxLines) => wrap(text, (t) => measure(MODE_FONT[mode], t), width, maxLines);

/** What a variant's tag says: its letter and condition, and what happens to it when it is not the chosen one. */
export function variantText(v: VariantInfo, mode: FlagMode): string {
  const head = `${v.letter} · ${v.cond}`;
  return v.selected ? `✓ ${head}` : `${head} · ${mode === "strip" ? "removed" : "not selected"}`;
}

/** What a block's inline A/B tag says: the flags, how many branches and the letter the flag values pick. */
export function inlineText(info: InlineInfo): string {
  const flags = info.flags.join(", ") || "flag";
  const any = info.chains.some((c) => c.branches.some((b) => b.chosen));
  const arrow = info.letter ? ` → ${info.letter}` : any ? " → mixed" : " → none";
  return `A/B · ${flags} · ${info.count} branch${info.count === 1 ? "" : "es"}${arrow}`;
}

export interface Scene {
  wf: Workflow;
  L: Layout;
  nums: Record<string, string>;
  /** Block id -> its A/B variant (letter, condition, whether the flag values choose it); only blocks with a `when`. */
  variants?: Map<string, VariantInfo>;
  /** Block id -> the `{{#if}}` A/B branches inside its text (count, flags, the branch chosen); only blocks that have any. */
  inline?: Map<string, InlineInfo>;
  /** How the prompt treats the variants not chosen: `embed` keeps them marked, `strip` drops them. */
  flagMode?: FlagMode;
  /** Set when the scene is the Simple task board rather than the stage editor. */
  board?: BoardView;
}

/** How the Simple task board draws the same scene: read-only (no Group ticks or + links), its
 *  own card eyebrows, and dimmed, dashed locked options. */
export interface BoardView {
  /** Card key -> eyebrow, in place of "STAGE n". */
  eyebrows: Record<string, string>;
  /** Cards that do not run (switched off, or waiting on an option that is off). */
  locked: ReadonlySet<string>;
  /** Cards whose × unticks their option. */
  removable: ReadonlySet<string>;
  /** Edges into or out of a locked card: dashed and dimmed. */
  dimEdges: ReadonlySet<number[]>;
  /** Stubs that only meet a bus, drawn without a head. */
  headless: ReadonlySet<number[]>;
  /** Frames whose cards are all locked. */
  dimFrames: ReadonlySet<string>;
  /** Edge -> a stable key (its two ends), for its wobble and its identity across redraws. */
  edgeKeys?: ReadonlyMap<number[], string>;
  /** The empty Goal card's call to action, in place of "Describe the goal". */
  goalCta?: string;
  /** Loop id -> its pill text, where the loop stops on a judgement rather than a score. */
  loopText?: Record<string, string>;
}

/** Canvas-only copy for empty cards. The core layout keeps the Python app's wording (and so its card
 *  heights); these say how to fill the card in and are drawn in the same number of lines. */
export const GOAL_EMPTY = "Click to describe the goal";
export const ONCANCEL_EMPTY = "Optional: clean-up steps to run if you cancel.";
const CARD_TEXT_W = CARD_W - 2 * TEXT_X;

/** The lines a card draws: the layout's, or the friendlier empty copy in as many lines. */
export function cardLines(L: Layout, key: string, empty: boolean): string[] {
  const lines = L.lines.get(key) ?? [];
  if (!empty || (key !== "goal" && key !== "on_cancel")) return lines;
  const text = key === "goal" ? GOAL_EMPTY : ONCANCEL_EMPTY;
  const mode = key === "goal" ? "goal" : "body";
  const max = Math.max(1, lines.length);
  const out = textLines(text, mode, CARD_TEXT_W, max);
  // Balance the lines (narrow the box while the line count holds) so the copy never ends on a
  // one-word orphan.
  let best = out;
  for (let w = CARD_TEXT_W - 8; out.length > 1 && w > CARD_TEXT_W / 2; w -= 8) {
    const next = textLines(text, mode, w, max);
    if (next.length !== out.length || next.join(" ") !== out.join(" ")) break;
    best = next;
  }
  return best;
}

/** Lay the workflow out. Height 0: the layout takes only the room it needs (the canvas is infinite). */
export function buildScene(dict: WorkflowDict, flags?: FlagValues, flagMode: FlagMode = "embed"): Scene {
  const wf = new Workflow(dict);
  const variants = variantStates(wf, flags);
  const inline = inlineStates(wf, flags);
  return {
    wf,
    L: layout(wf, 0, textLines),
    nums: wf.stageNumbers(),
    ...(variants.size || inline.size ? { flagMode } : {}),
    ...(variants.size ? { variants } : {}),
    ...(inline.size ? { inline } : {}),
  };
}

export type DropTarget = { kind: "branch"; par: string } | { kind: "link"; index: number };

/** `_drop_target`: inside a parallel frame joins it, otherwise the gap nearest horizontally. */
export function dropTarget(L: Layout, x: number, y: number): DropTarget | null {
  for (const [pid, [x0, y0, x1, y1]] of L.pars) if (x0 <= x && x <= x1 && y0 <= y && y <= y1) return { kind: "branch", par: pid };
  let best = -1;
  let dist = Infinity;
  L.links.forEach((ln, i) => {
    const d = Math.abs(ln.cx - x);
    if (d < dist) {
      dist = d;
      best = i;
    }
  });
  return best >= 0 ? { kind: "link", index: best } : null;
}

/** Everything drawn: cards, frames, shelf, plus the loop return arrows below the flow. */
export function sceneBounds(L: Layout): Box {
  const boxes: Box[] = [...L.cards.values(), ...L.loops.values(), ...L.pars.values(), ...L.forks.values()];
  if (L.shelf) boxes.push(L.shelf);
  if (!boxes.length) return [0, 0, L.width, L.height];
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const b of boxes) {
    x0 = Math.min(x0, b[0]);
    y0 = Math.min(y0, b[1]);
    x1 = Math.max(x1, b[2]);
    y1 = Math.max(y1, b[3]);
  }
  for (const bk of L.backs) y1 = Math.max(y1, bk.badge[1] + 12);
  for (const ln of L.links) x1 = Math.max(x1, ln.cx + 12);
  return [x0, y0, x1, y1];
}

/** A stable rough.js seed per element key, so the wobble never changes between renders. */
export function seedOf(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2147483646 + 1;
}

/** Card label shown on the drag ghost (`_start_ghost`). */
export function ghostLabel(b: Record<string, unknown>): string {
  if (b.type === "stage") return String(b.name || "Untitled stage");
  if (b.type === "intentions") return "Intentions";
  if (b.type === "function") return "Function: " + String(b.name ?? "");
  return "Prompt: " + String(b.text || "…");
}

/** The focus a card key stands for (goal, on-cancel header, cancel stage or block). */
export function cardFocus(key: string): StageFocus {
  if (key === "goal") return { kind: "goal" };
  if (key === "on_cancel") return { kind: "oncancel" };
  if (key.startsWith("cancel:")) return { kind: "cancel", i: Number(key.slice(7)) };
  return { kind: "block", id: key };
}

function cardKey(f: StageFocus | null): string | null {
  if (!f) return null;
  if (f.kind === "goal") return "goal";
  if (f.kind === "oncancel") return "on_cancel";
  if (f.kind === "cancel") return `cancel:${f.i}`;
  if (f.kind === "block") return f.id;
  return null;
}

/**
 * Keyboard focus walk over the cards in reading order (goal, the flow, the on-cancel lane,
 * then the function shelf). From no card, forward starts at the first and back at the last.
 */
export function stepCard(L: Layout, focus: StageFocus | null, dir: 1 | -1 | "first" | "last"): string | null {
  const keys = [...L.cards.keys()];
  if (!keys.length) return null;
  if (dir === "first") return keys[0] as string;
  if (dir === "last") return keys[keys.length - 1] as string;
  const i = keys.indexOf(cardKey(focus) ?? "");
  if (i < 0) return (dir > 0 ? keys[0] : keys[keys.length - 1]) as string;
  return keys[Math.max(0, Math.min(keys.length - 1, i + dir))] as string;
}

/** What a screen reader hears when a card gets keyboard focus. */
export function cardAnnouncement(scene: Scene, key: string): string {
  if (key === "goal") return "Goal: " + (scene.wf.goal.trim() || "not set");
  if (key === "on_cancel") return "On cancel";
  if (key.startsWith("cancel:")) {
    const i = Number(key.slice(7));
    const st = scene.wf.on_cancel.stages[i];
    return `Cancel stage ${i + 1}: ${st?.name || "Untitled stage"}`;
  }
  const b = scene.wf.block(key);
  if (!b) return "";
  const n = scene.nums[key];
  return (n ? `Stage ${n}: ` : "") + ghostLabel(b);
}

/** What a pointer is over: a data-hit role and its key. */
export interface Hit {
  role: "node" | "tick" | "del" | "plus" | "branch" | "loop" | "par" | "addcancel" | "variant" | "flags";
  key: string;
}

export function hitOf(target: EventTarget | null): Hit | null {
  const el = target instanceof Element ? target.closest<SVGElement | HTMLElement>("[data-hit]") : null;
  if (!el) return null;
  return { role: el.dataset.hit as Hit["role"], key: el.dataset.key ?? "" };
}
