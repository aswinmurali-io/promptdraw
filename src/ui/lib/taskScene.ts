// The Simple task board as a Stages scene: the ticked "How to work" options become stage cards,
// parallel frames and agentic loops in a Workflow, laid out here and drawn by the Stages
// SceneView, so both tabs share one renderer (cards, read-only hatching, model tags, frames,
// pills, loop arrows). The layout is the board's own: every row of the parallel group can chain
// (Multiple workers → its recon workers, Progress reports → Basic dashboard) and a row can hold
// a loop (the self-loop code review). The Task node is HTML (it is edited in place); the arrows
// start at its measured box. Display only: the prompt keeps TOGGLE_ORDER.
// @lat: [[ui#Canvas#Parallel option lanes]]
import {
  CARD_W,
  GAP,
  GOAL_LINES,
  PLACEHOLDER,
  LANE_GAP,
  LOOP_B,
  LOOP_HEAD,
  LOOP_MIN_W,
  LETTERS,
  LOOP_X,
  Layout,
  PAR_B,
  PAR_TOP,
  PAR_X,
  RECON_COUNT_DEFAULT,
  REVIEW_LOOP_METRIC,
  REVIEW_MODEL,
  REVIEW_PASSES_DEFAULT,
  TEXT_X,
  BODY_LINES,
  TOGGLE_TEXT,
  Workflow,
  bodyText,
  cardHeight,
  positiveInt,
  reconCount,
  type Block,
  type Box,
  type ReconModel,
  type ToggleKey,
} from "../../core";
import { textLines, type BoardView, type Scene } from "../stages/scene";
import { laneRows } from "./intentGroups";
import { INTENT_SUMMARY } from "./intentSummaries";

/** The settings the board reads besides the toggles. */
export interface TaskSceneInput {
  /** The task text: the Goal card's words (edited in How to work). */
  task: string;
  toggles: Record<ToggleKey, boolean>;
  recon_model: ReconModel;
  recon_count: string;
  review_passes: string;
  review_minor: boolean;
}

/** One unit in a row: a card, a parallel frame of cards, or a loop round a run of units. */
export type Item = { kind: "card"; key: string } | { kind: "par"; id: string; keys: string[] } | { kind: "loop"; id: string; items: Item[] };

/** The start of the flow: the task, drawn as the Stages Goal card; it opens the Task field. */
export const GOAL_KEY = "goal";
/** The end of the flow: the compiled prompt, which the card opens. */
export const PROMPT_KEY = "prompt_out";
export const MAIN_PAR = "p_main";
export const RECON_PAR = "p_recon";
export const REVIEW_LOOP = "l_review";
export const REVIEW_FIX = "review_fix";
export const UI_LOOP = "l_ui";
/** UI intelligence's loop, step by step as its prompt line runs it. */
const UI_STEPS: { id: string; name: string; text: string; read_only?: boolean }[] = [
  { id: "ui_shot", name: "Screenshot", text: "Capture the current UI.", read_only: true },
  { id: "ui_analyse", name: "Analyse", text: "Read it with the frontend-design skill.", read_only: true },
  { id: "ui_iterate", name: "Iterate", text: "Change the implementation." },
  { id: "ui_critique", name: "Critique", text: "Judge it with the design-critique skill.", read_only: true },
];
/** What the UI loop's pill says: its prompt line stops on the goal and the look, not a count. */
const UI_UNTIL = "until it meets the goal and looks good";

/** A board card's toggle (the one its × unticks), or null for the Prompt card. */
export function toggleOfCard(key: string): ToggleKey | null {
  if (key === PROMPT_KEY || key === GOAL_KEY) return null;
  if (key.startsWith("recon_")) return "recon";
  if (key === REVIEW_FIX) return "review_loop";
  if (key.startsWith("ui_")) return "ui";
  return key in TOGGLE_TEXT ? (key as ToggleKey) : null;
}

export interface BoardModel {
  rows: Item[][];
  blocks: Block[];
  eyebrows: Record<string, string>;
  locked: Map<string, string>;
  loops: { id: string; blocks: string[]; passes?: number }[];
  recon: string[];
}

/** What is ticked, as rows of units with the blocks they draw. */
export function boardModel(input: TaskSceneInput): BoardModel {
  const { toggles } = input;
  const blocks: Block[] = [];
  const eyebrows: Record<string, string> = {};
  const locked = new Map<string, string>();
  const add = (b: Block, eyebrow: string, lock: string | null) => {
    blocks.push(b);
    eyebrows[b.id] = lock ? `LOCKED · ${eyebrow}` : eyebrow;
    if (lock) locked.set(b.id, lock);
  };
  const loops: BoardModel["loops"] = [];
  let recon: string[] = [];
  const rows: Item[][] = [];
  for (const lane of laneRows(toggles)) {
    const row: Item[] = [];
    for (const n of lane) {
      const group = n.group.toUpperCase();
      const [label] = TOGGLE_TEXT[n.key];
      if (n.key === "recon" && !(n.locked && !toggles.workers)) {
        // Recon fans out over the workers: one read-only Recon function block per worker,
        // lettered A, B, C… like a parallel group's branches, each on the recon model.
        const count = reconCount(input.recon_count) ?? RECON_COUNT_DEFAULT;
        recon = Array.from({ length: count }, (_, i) => `recon_${i + 1}`);
        recon.forEach((id, i) =>
          add(
            { id, type: "function", name: `Recon ${(LETTERS[i] ?? String(i + 1)).toUpperCase()}`, params: [], text: n.locked ?? "Map code, callers, data flow and tests. Read-only.", read_only: true, model: input.recon_model },
            "FUNCTION",
            n.locked,
          ),
        );
        row.push({ kind: "par", id: RECON_PAR, keys: recon });
        continue;
      }
      if (n.key === "review_loop" && !n.locked) continue; // drawn inside the review's loop
      if (n.key === "review" && toggles.review_loop) {
        const passes = positiveInt(input.review_passes, REVIEW_PASSES_DEFAULT);
        // The reviewer is a read-only function block on the strongest reviewing model (a fresh
        // opus subagent, as the prompt asks); the fixes run in the session, on its own model.
        add({ id: "review", type: "function", name: "Code review", params: [], text: "Fresh reviewer: rank findings critical to low.", read_only: true, model: REVIEW_MODEL }, "FUNCTION", null);
        const fix = input.review_minor ? "Fix every critical, high, medium and low finding." : "Fix every critical and high finding; list medium and low.";
        add({ id: REVIEW_FIX, type: "stage", name: "Fix findings", prompt: fix }, group, null);
        loops.push({ id: REVIEW_LOOP, blocks: ["review", REVIEW_FIX], passes });
        row.push({ kind: "loop", id: REVIEW_LOOP, items: [{ kind: "card", key: "review" }, { kind: "card", key: REVIEW_FIX }] });
        continue;
      }
      if (n.key === "ui") {
        // UI intelligence is itself an agentic loop: screenshot, analyse, iterate, critique,
        // again until the goal is met and the UI looks good.
        for (const st of UI_STEPS)
          add({ id: st.id, type: "stage", name: st.name, prompt: n.locked ?? st.text, ...(st.read_only ? { read_only: true } : {}) }, group, n.locked);
        loops.push({ id: UI_LOOP, blocks: UI_STEPS.map((st) => st.id) });
        row.push({ kind: "loop", id: UI_LOOP, items: UI_STEPS.map((st) => ({ kind: "card", key: st.id })) });
        continue;
      }
      add({ id: n.key, type: "stage", name: label, prompt: n.locked ?? INTENT_SUMMARY[n.key] ?? "" }, group, n.locked);
      row.push({ kind: "card", key: n.key });
    }
    if (row.length) rows.push(row);
  }
  blocks.push({ id: PROMPT_KEY, type: "prompt", text: "Everything above, compiled. Open the prompt." });
  return { rows, blocks, eyebrows, locked, loops, recon };
}

/** Space between the main frame's rows. */
const ROW_GAP = 22;
/** Room above the main frame's first row, for its pill and a nested frame's. */
const MAIN_TOP = 34;
/** Inside the frame: the buses run this far outside the cards (as on the Stages board). */
const BUS = 16;

interface Placed {
  box: Box;
  /** Cards an arrow into the unit lands on, and cards an arrow out of it starts from. */
  ins: string[];
  outs: string[];
}

export interface TaskScene {
  scene: Scene;
  width: number;
  height: number;
}

/**
 * Lay the board out left to right, as the Stages flow runs: the Goal card (the task), the
 * parallel frame of rows, then the Prompt card, all centred on one line.
 */
export function taskScene(input: TaskSceneInput): TaskScene {
  const m = boardModel(input);
  const wf = new Workflow({
    name: "simple-task",
    goal: input.task,
    blocks: m.blocks,
    parallels: m.recon.length ? [{ id: RECON_PAR, blocks: m.recon, join: "all" }] : [],
    loops: m.loops.map((l) => ({ id: l.id, blocks: l.blocks, agentic: true, mode: "reward", metric: REVIEW_LOOP_METRIC, target: 100, max_passes: l.passes ?? 1 })),
  });
  const L = new Layout();
  const heights = new Map<string, number>();
  for (const b of m.blocks) {
    const mode = b.type === "stage" ? "body" : "mono";
    const lines = textLines(bodyText(b), mode, CARD_W - 2 * TEXT_X, BODY_LINES);
    L.lines.set(b.id, lines);
    heights.set(b.id, cardHeight(b.type, lines.length));
  }
  const goalLines = textLines(input.task.trim() || PLACEHOLDER, "goal", CARD_W - 2 * TEXT_X, GOAL_LINES);
  L.lines.set(GOAL_KEY, goalLines);
  heights.set(GOAL_KEY, cardHeight("goal", goalLines.length));
  const h = (k: string) => heights.get(k) ?? 0;
  const dimEdges = new Set<number[]>();
  const edgeKeys = new Map<number[], string>();
  const isLocked = (k: string) => m.locked.has(k);
  /** An arrow from card `a` to card `b`: keyed by its ends, so it keeps its wobble as the board changes. */
  const edge = (pts: number[], dim: boolean, a: string, b: string) => {
    L.edges.push(pts);
    edgeKeys.set(pts, `${a}>${b}`);
    if (dim) dimEdges.add(pts);
  };
  const card = (k: string) => L.cards.get(k) as Box;

  // ---- sizes
  const size = (it: Item): [number, number] => {
    if (it.kind === "card") return [CARD_W, h(it.key)];
    if (it.kind === "par") return [CARD_W + 2 * PAR_X, PAR_TOP + it.keys.reduce((s, k) => s + h(k), 0) + LANE_GAP * (it.keys.length - 1) + PAR_B];
    const [iw, ih] = runSize(it.items);
    return [Math.max(iw + 2 * LOOP_X, LOOP_MIN_W), LOOP_HEAD + ih + LOOP_B];
  };
  const runSize = (items: Item[]): [number, number] => {
    const s = items.map(size);
    return [s.reduce((a, [w]) => a + w, 0) + GAP * (s.length - 1), Math.max(...s.map(([, hh]) => hh))];
  };

  // ---- placement from a unit's top-left corner; a run centres its units on one line, as the
  // Stages flow does
  const place = (it: Item, x: number, y: number): Placed => {
    const [w, hh] = size(it);
    if (it.kind === "card") {
      L.cards.set(it.key, [x, y, x + CARD_W, y + h(it.key)]);
      return { box: [x, y, x + w, y + hh], ins: [it.key], outs: [it.key] };
    }
    if (it.kind === "par") {
      let cy = y + PAR_TOP;
      for (const k of it.keys) {
        L.cards.set(k, [x + PAR_X, cy, x + PAR_X + CARD_W, cy + h(k)]);
        cy += h(k) + LANE_GAP;
      }
      L.pars.set(it.id, [x, y, x + w, y + hh]);
      return { box: [x, y, x + w, y + hh], ins: it.keys, outs: it.keys };
    }
    const [iw] = runSize(it.items);
    const inner = run(it.items, x + (w - iw) / 2, y + LOOP_HEAD);
    L.loops.set(it.id, [x, y, x + w, y + hh]);
    const first = inner[0] as Placed;
    const last = inner[inner.length - 1] as Placed;
    // The return arrow under the run, from the last unit back to the first (core layout).
    const gy = Math.max(...inner.map((p) => p.box[3])) + 22;
    const xs = last.box[0] + (last.box[2] - last.box[0]) * 0.5;
    const xe = first.box[0] + (first.box[2] - first.box[0]) * 0.5;
    L.backs.push({ pts: [xs, last.box[3], xs, gy, xe, gy, xe, first.box[3] + 2], badge: [(xs + xe) / 2, gy] });
    return { box: [x, y, x + w, y + hh], ins: first.ins, outs: last.outs };
  };

  /** Units in a run, joined by arrows the way the Stages flow joins steps. */
  const run = (items: Item[], x0: number, y0: number): Placed[] => {
    const [, rh] = runSize(items);
    const out: Placed[] = [];
    let x = x0;
    for (const it of items) {
      const [w, hh] = size(it);
      const p = place(it, x, y0 + (rh - hh) / 2);
      const prev = out[out.length - 1];
      if (prev) links(prev.outs, p.ins);
      out.push(p);
      x += w + GAP;
    }
    return out;
  };

  /** Arrows from every card in A to every card in B over one bus (core `layout`). */
  const links = (A: string[], B: string[], busAt?: number) => {
    const ua = union(A.map(card));
    const ub = union(B.map(card));
    const bus = busAt ?? (A.length > 1 ? ua[2] + BUS : B.length > 1 ? ub[0] - BUS : (ua[2] + ub[0]) / 2);
    for (const a of A)
      for (const b of B) {
        const ra = card(a);
        const rb = card(b);
        const ay = (ra[1] + ra[3]) / 2;
        const by = (rb[1] + rb[3]) / 2;
        const dim = isLocked(a) || isLocked(b);
        if (Math.abs(ay - by) < 1) edge([ra[2], ay, rb[0] - 1, by], dim, a, b);
        else edge([ra[2], ay, bus, ay, bus, by, rb[0] - 1, by], dim, a, b);
      }
  };

  // ---- the main frame, centred on the Task node, then the Prompt card
  const rowSizes = m.rows.map(runSize);
  const frameW = Math.max(CARD_W, ...rowSizes.map(([w]) => w)) + 2 * PAR_X;
  const frameH = MAIN_TOP + rowSizes.reduce((a, [, hh]) => a + hh, 0) + ROW_GAP * Math.max(0, m.rows.length - 1) + PAR_B;
  const ph = h(PROMPT_KEY);
  const gh = h(GOAL_KEY);
  const mid = Math.max(gh / 2, m.rows.length ? frameH / 2 : 0, ph / 2) + 4;
  const gx = 4;
  L.cards.set(GOAL_KEY, [gx, mid - gh / 2, gx + CARD_W, mid + gh / 2]);
  const goal = card(GOAL_KEY);
  const fx = goal[2] + GAP;
  const fy = mid - frameH / 2;
  const placedRows: Placed[][] = [];
  if (m.rows.length) {
    // The main frame first, so it paints under the frames it holds.
    L.pars.set(MAIN_PAR, [fx, fy, fx + frameW, fy + frameH]);
    let y = fy + MAIN_TOP;
    m.rows.forEach((r, i) => {
      placedRows.push(run(r, fx + PAR_X, y));
      y += (rowSizes[i] as [number, number])[1] + ROW_GAP;
    });
  }
  const px = (m.rows.length ? fx + frameW : goal[2]) + GAP;
  L.cards.set(PROMPT_KEY, [px, mid - ph / 2, px + CARD_W, mid + ph / 2]);
  const pr = card(PROMPT_KEY);

  if (m.rows.length) {
    // In from the Goal card over the bus inside the frame's left edge; out over the right one.
    const L0 = fx + PAR_X;
    for (const k of placedRows.flatMap((r) => (r[0] as Placed).ins)) {
      const rb = card(k);
      const by = (rb[1] + rb[3]) / 2;
      edge([goal[2], mid, L0 - BUS, mid, L0 - BUS, by, rb[0] - 1, by], isLocked(k), GOAL_KEY, k);
    }
    links(
      placedRows.flatMap((r) => (r[r.length - 1] as Placed).outs),
      [PROMPT_KEY],
      fx + frameW - PAR_X + BUS,
    );
  } else {
    // Nothing ticked: the task goes straight to the prompt, dashed.
    edge([goal[2], mid, pr[0] - 1, mid], true, GOAL_KEY, PROMPT_KEY);
  }

  // The scene's own extent, from the top-left (0, 0).
  const bottom = Math.max(pr[3], m.rows.length ? fy + frameH : 0, goal[3]) + 8;
  L.width = pr[2] + 4;
  L.height = bottom;

  const board: BoardView = {
    eyebrows: m.eyebrows,
    locked: new Set(m.locked.keys()),
    removable: new Set(m.blocks.map((b) => b.id).filter((k) => k !== PROMPT_KEY)),
    edgeKeys,
    goalCta: "✎  Describe the task",
    dimEdges,
    headless: new Set(),
    dimFrames: new Set(m.recon.length && m.recon.every(isLocked) ? [RECON_PAR] : []),
    loopText: m.loops.some((l) => l.id === UI_LOOP) ? { [UI_LOOP]: UI_UNTIL } : {},
  };
  return { scene: { wf, L, nums: {}, board }, width: L.width, height: bottom };
}

function union(bs: Box[]): Box {
  return [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))];
}
