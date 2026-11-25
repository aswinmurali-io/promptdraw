// Port of the pure parts of the Python app's stage_builder.py: text wrapping, card body text and
// the automatic left-to-right flow layout of a workflow (`layout()`). No drawing here.
// @lat: [[core#Modules]]
import { STAGE_MODELS, oneOf } from "./constants";
import { summary } from "./intentions";
import { forkGroups, type Fork } from "./forks";
import { pyRstrip, pySplit, pyStrip, pyStr } from "./py";
import { Workflow, callRe, parseArgs, type Loop } from "./workflow";

// ---------------------------------------------------------------- geometry (px)
export const M = 24;
export const GAP = 56;
export const LOOP_X = 18;
export const LOOP_HEAD = 44;
export const LOOP_B = 40;
export const LOOP_MIN_W = 460;
export const PAR_X = 30;
export const PAR_TOP = 22;
export const PAR_B = 14;
export const LANE_GAP = 12;
/** An A/B fork's lane label row, above each of its cards. */
export const FORK_LABEL_H = 24;
export const ADD_H = 36;
export const SHELF_X = 16;
export const SHELF_HEAD = 34;
export const SHELF_B = 14;
export const SHELF_GAP = 28;
export const FOOT_H = 30;
export const TAB_R = 9;
export const CARD_W = 260;
export const PAD = 10;
export const HEAD_H = 20;
export const NAME_H = 19;
export const LINE_H = 17;
export const TEXT_X = 14;
export const HEAD_R = 52;
export const BODY_LINES = 3;
export const GOAL_LINES = 4;
export const PLACEHOLDER = "No description yet";
export const ONCANCEL_EMPTY = "No cancel stages yet. Click here, then add one.";
export const OC_GAP = 36;
export const NO_INTENTIONS = "Nothing switched on yet";
export const NO_MODEL = "none";

export type Box = [x0: number, y0: number, x1: number, y1: number];
export type Measure = (text: string) => number;
export type TextMode = "goal" | "body" | "mono";
export type TextLines = (text: string, mode: TextMode, width: number, maxLines: number) => string[];

/** `wrap`: word-wrap to `width` px, at most `maxLines` lines, ending in " …" when cut. */
export function wrap(text: unknown, measure: Measure, width: number, maxLines: number): string[] {
  const words = pySplit(pyStr(text)).join(" ").split(" ");
  const lines: string[] = [];
  let cur = "";
  const len = (s: string) => Array.from(s).length;
  const head = (s: string, n: number) => Array.from(s).slice(0, n).join("");
  const tail = (s: string, n: number) => Array.from(s).slice(n).join("");
  for (const w of words) {
    const trial = !cur ? w : cur + " " + w;
    if (measure(trial) <= width || !cur) cur = trial;
    else {
      lines.push(cur);
      cur = w;
    }
    while (measure(cur) > width && len(cur) > 1) {
      let cut = len(cur) - 1;
      while (cut > 1 && measure(head(cur, cut)) > width) cut -= 1;
      lines.push(head(cur, cut));
      cur = tail(cur, cut);
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    let last = lines[maxLines - 1] ?? "";
    while (last && measure(last + " …") > width) last = pyRstrip(head(last, len(last) - 1));
    return [...lines.slice(0, maxLines - 1), last + " …"];
  }
  return lines.length ? lines : [""];
}

/** `model_tag`: "   ·   opus" for a block with a model hint. */
export function modelTag(fn: Record<string, unknown>): string {
  return oneOf(STAGE_MODELS, fn.model) ? "   ·   " + fn.model : "";
}

/** `body_text`: a card's body; [[Call: a = b]] reads "ƒ Call (a: b)". */
export function bodyText(b: Record<string, unknown>): string {
  if (b.type === "intentions") return summary(b).join(" · ");
  if (b.type === "function") return pyStrip(pyStr(b.text ?? ""));
  const text = pyStrip(pyStr(b.type === "stage" ? b.prompt : b.text));
  return text.replace(callRe(), (_m, name: string, args: string | undefined) => {
    const bits = args ? ` (${[...parseArgs(args)].map(([k, v]) => `${k}: ${v}`).join(", ")})` : "";
    return `ƒ ${pyStrip(name)}${bits}`;
  });
}

export function cardHeight(kind: string, nLines: number): number {
  return PAD + HEAD_H + (kind === "stage" || kind === "function" ? NAME_H : 0) + nLines * LINE_H + PAD;
}

export interface GapLink {
  cx: number;
  cy: number;
  y0: number;
  y1: number;
  /** Block index a new block dropped here is inserted at. */
  at: number;
  loop: string | null;
}
export interface BackArrow {
  pts: number[];
  badge: [number, number];
}
export interface FnLink {
  from: string;
  to: string;
  pts: number[];
}

export class Layout {
  /** key ("goal", "on_cancel", "cancel:i" or block id) -> box. */
  cards = new Map<string, Box>();
  lines = new Map<string, string[]>();
  links: GapLink[] = [];
  loops = new Map<string, Box>();
  pars = new Map<string, Box>();
  /** A/B fork frames (forks.ts), by fork id; a fork has no + branch tile. */
  forks = new Map<string, Box>();
  /** Fork id -> its flag and block ids, in lane order. */
  forkInfo = new Map<string, Fork>();
  /** Block id -> where its lane label sits (the label's left edge and middle). */
  forkLabels = new Map<string, [number, number]>();
  tiles = new Map<string, Box>();
  edges: number[][] = [];
  cancelEdges: number[][] = [];
  backs: BackArrow[] = [];
  shelf: Box | null = null;
  uses = new Map<string, string[]>();
  tabs = new Map<string, [number, number]>();
  fnlinks: FnLink[] = [];
  width = 0;
  height = 0;
}

function card(L: Layout, key: string): Box {
  const b = L.cards.get(key);
  if (!b) throw new Error(`no card ${key}`);
  return b;
}

/** `layout`: workflow -> boxes, gaps and edges. `height` is the visible canvas height. */
export function layout(wf: Workflow, height: number, textLines: TextLines): Layout {
  const L = new Layout();
  const heights = new Map<string, number>();
  const h = (k: string) => heights.get(k) as number;

  const linesFor = (key: string, kind: string, text: string): number => {
    const mode: TextMode = key === "goal" ? "goal" : kind === "prompt" || kind === "function" ? "mono" : "body";
    const lines = textLines(
      text || (kind === "intentions" ? NO_INTENTIONS : PLACEHOLDER),
      mode,
      CARD_W - 2 * TEXT_X,
      key === "goal" ? GOAL_LINES : BODY_LINES,
    );
    L.lines.set(key, lines);
    heights.set(key, cardHeight(kind, lines.length));
    return h(key);
  };

  linesFor("goal", "goal", pyStrip(wf.goal));
  const nCancel = wf.on_cancel.stages.length;
  linesFor(
    "on_cancel",
    "oncancel",
    nCancel ? `Runs in order when I cancel the run. Give up after ${wf.on_cancel.grace_minutes} min.` : ONCANCEL_EMPTY,
  );
  wf.on_cancel.stages.forEach((st, i) =>
    linesFor(`cancel:${i}`, "stage", bodyText({ type: "stage", name: st.name, prompt: st.prompt })),
  );
  for (const b of wf.blocks) {
    linesFor(b.id, b.type, bodyText(b));
    if (b.type === "stage" || b.type === "prompt") {
      const used: string[] = [];
      for (const [f] of wf.uses(b)) if (f && !used.includes(f.id)) used.push(f.id);
      if (used.length) {
        L.uses.set(b.id, used);
        heights.set(b.id, h(b.id) + FOOT_H);
      }
    }
  }

  // A/B forks group like parallel branches for flow and edges, but are drawn apart and edited as stages.
  const forkOf = new Map<string, Fork>();
  for (const f of forkGroups(wf)) {
    L.forkInfo.set(f.id, f);
    for (const b of f.blocks) forkOf.set(b, f);
  }
  const chunks = (ids: string[], outer: boolean, within: Loop | null = null): string[][] => {
    const out: string[][] = [];
    let i = 0;
    while (i < ids.length) {
      const id = ids[i] as string;
      const group = (outer ? wf.childLoop(id, within) : null) ?? wf.parOf(id) ?? forkOf.get(id);
      const g = group ? [...group.blocks] : [id];
      out.push(g);
      i += g.length;
    }
    return out;
  };

  const forkSize = (ids: string[]): [number, number] => {
    const hh = ids.reduce((s, b) => s + FORK_LABEL_H + h(b), 0) + LANE_GAP * ids.length;
    return [CARD_W + 2 * PAR_X, PAR_TOP + hh + PAR_B];
  };

  const parSize = (ids: string[]): [number, number] => {
    const hh = ids.reduce((s, b) => s + h(b), 0) + LANE_GAP * ids.length + ADD_H;
    return [CARD_W + 2 * PAR_X, PAR_TOP + hh + PAR_B];
  };

  const extent = (ids: string[], within: Loop | null): [number, number, number] => {
    let w = 0;
    let above = 0;
    let below = 0;
    chunks(ids, true, within).forEach((g, k) => {
      if (k || within === null) w += GAP;
      const g0 = g[0] as string;
      const lp = wf.childLoop(g0, within);
      const p = wf.parOf(g0);
      const fk = p ? undefined : forkOf.get(g0);
      let uw: number;
      let ua: number;
      let ub: number;
      if (lp) {
        const [iw, ia, ib] = extent(lp.blocks, lp);
        uw = Math.max(iw + 2 * LOOP_X, LOOP_MIN_W);
        ua = ia + LOOP_HEAD;
        ub = ib + LOOP_B;
      } else if (p || fk) {
        const [pw, ph] = p ? parSize(p.blocks) : forkSize((fk as Fork).blocks);
        uw = pw;
        ua = ub = ph / 2;
      } else {
        uw = CARD_W;
        ua = ub = h(g0) / 2;
      }
      w += uw;
      above = Math.max(above, ua);
      below = Math.max(below, ub);
    });
    return [w, above, below];
  };

  const fns = wf.blocks.filter((b) => b.type === "function").map((b) => b.id);
  const flow = wf.ids().filter((i) => !fns.includes(i));
  const shelfH = fns.length ? SHELF_HEAD + Math.max(...fns.map(h)) + SHELF_B + SHELF_GAP : 0;

  const [, fa, fb] = extent(flow, null);
  const ga = h("goal") / 2;
  const above = Math.max(fa, ga) + 12;
  const below = Math.max(fb, ga);
  const laneKeys = ["on_cancel", ...Array.from({ length: nCancel }, (_, i) => `cancel:${i}`)];
  const laneCardH = Math.max(...laneKeys.map(h));
  const laneH = OC_GAP + laneCardH + M;
  const hMain = Math.max(height - laneH, shelfH + above + below + 2 * M);
  const H = hMain + laneH;
  const cy = shelfH + (hMain - shelfH - (above + below)) / 2 + above;

  const link = (x: number, at: number, loop: Loop | null) => {
    L.links.push({ cx: x + GAP / 2, cy, y0: cy - 60, y1: cy + 60, at, loop: loop ? loop.id : null });
  };
  const place = (key: string, x: number): number => {
    L.cards.set(key, [x, cy - h(key) / 2, x + CARD_W, cy + h(key) / 2]);
    return x + CARD_W;
  };

  const units = (ids: string[], loop: Loop | null, xIn: number): number => {
    let x = xIn;
    chunks(ids, true, loop).forEach((g, k) => {
      const g0 = g[0] as string;
      if (loop === null || k) {
        link(x, wf.idx(g0), loop);
        x += GAP;
      }
      const lp = wf.childLoop(g0, loop);
      const p = wf.parOf(g0);
      const fk = p ? undefined : forkOf.get(g0);
      if (lp) {
        const [iw, ia, ib] = extent(lp.blocks, lp);
        const fw = Math.max(iw + 2 * LOOP_X, LOOP_MIN_W);
        units(lp.blocks, lp, x + (fw - iw) / 2);
        L.loops.set(lp.id, [x, cy - ia - LOOP_HEAD, x + fw, cy + ib + LOOP_B]);
        x += fw;
      } else if (p) {
        const [pw, ph] = parSize(p.blocks);
        const top = cy - ph / 2;
        let y = cy - ph / 2 + PAR_TOP;
        for (const b of p.blocks) {
          L.cards.set(b, [x + PAR_X, y, x + PAR_X + CARD_W, y + h(b)]);
          y += h(b) + LANE_GAP;
        }
        L.tiles.set(p.id, [x + PAR_X, y, x + PAR_X + CARD_W, y + ADD_H]);
        L.pars.set(p.id, [x, top, x + pw, top + ph]);
        x += pw;
      } else if (fk) {
        const [fw, fh] = forkSize(fk.blocks);
        const top = cy - fh / 2;
        let y = top + PAR_TOP;
        for (const b of fk.blocks) {
          L.forkLabels.set(b, [x + PAR_X, y + FORK_LABEL_H / 2]);
          L.cards.set(b, [x + PAR_X, y + FORK_LABEL_H, x + PAR_X + CARD_W, y + FORK_LABEL_H + h(b)]);
          y += FORK_LABEL_H + h(b) + LANE_GAP;
        }
        L.forks.set(fk.id, [x, top, x + fw, top + fh]);
        x += fw;
      } else x = place(g0, x);
    });
    return x;
  };

  const x = units(flow, null, place("goal", M));
  link(x, wf.blocks.length, null);
  const ly = hMain + OC_GAP + laneCardH / 2;
  let lx = M;
  for (const k of laneKeys) {
    L.cards.set(k, [lx, ly - h(k) / 2, lx + CARD_W, ly + h(k) / 2]);
    lx += CARD_W + GAP;
  }
  for (let i = 0; i + 1 < laneKeys.length; i++) {
    const ra = card(L, laneKeys[i] as string);
    const rb = card(L, laneKeys[i + 1] as string);
    const edge = [ra[2], (ra[1] + ra[3]) / 2, rb[0] - 1, (rb[1] + rb[3]) / 2];
    L.edges.push(edge);
    L.cancelEdges.push(edge);
  }
  let sx = M + SHELF_X;
  for (const f of fns) {
    L.cards.set(f, [sx, M + SHELF_HEAD, sx + CARD_W, M + SHELF_HEAD + h(f)]);
    sx += CARD_W + SHELF_X;
  }
  if (fns.length) {
    L.shelf = [M, M, sx, M + shelfH - SHELF_GAP];
    const lane = M + shelfH - SHELF_GAP / 2;
    for (const [key, used] of L.uses) {
      const [, y0, x1] = card(L, key);
      const tx = x1 - HEAD_R - TAB_R - 8;
      L.tabs.set(key, [tx, y0]);
      used.forEach((fid, k) => {
        const [fx0, , fx1, fy1] = card(L, fid);
        const fx = fx0 + ((fx1 - fx0) * (k + 1)) / (used.length + 1);
        L.fnlinks.push({ from: key, to: fid, pts: [tx, y0 - TAB_R, tx, lane, fx, lane, fx, fy1 + 1] });
      });
    }
  }
  L.width = Math.max(x + GAP, sx, lx) + M;
  L.height = H;

  const union = (keys: string[]): Box => {
    const bs = keys.map((k) => card(L, k));
    return [
      Math.min(...bs.map((b) => b[0])),
      Math.min(...bs.map((b) => b[1])),
      Math.max(...bs.map((b) => b[2])),
      Math.max(...bs.map((b) => b[3])),
    ];
  };
  const steps = [["goal"], ...chunks(flow, false)];
  for (let i = 0; i + 1 < steps.length; i++) {
    const A = steps[i] as string[];
    const B = steps[i + 1] as string[];
    const ua = union(A);
    const ub = union(B);
    const bus = A.length > 1 ? ua[2] + 16 : B.length > 1 ? ub[0] - 16 : (ua[2] + ub[0]) / 2;
    for (const a of A) {
      for (const b of B) {
        const ra = card(L, a);
        const rb = card(L, b);
        const ay = (ra[1] + ra[3]) / 2;
        const by = (rb[1] + rb[3]) / 2;
        if (Math.abs(ay - by) < 1) L.edges.push([ra[2], ay, rb[0] - 1, by]);
        else L.edges.push([ra[2], ay, bus, ay, bus, by, rb[0] - 1, by]);
      }
    }
  }

  for (const lp of wf.loops) {
    const unitBox = (g: string[]): Box => {
      const g0 = g[0] as string;
      const inner = wf.childLoop(g0, lp);
      const p = wf.parOf(g0);
      const fk = p ? undefined : forkOf.get(g0);
      if (inner) return L.loops.get(inner.id) as Box;
      if (p) return L.pars.get(p.id) as Box;
      if (fk) return L.forks.get(fk.id) as Box;
      return card(L, g0);
    };
    const boxes = chunks(lp.blocks, true, lp).map(unitBox);
    const first = boxes[0] as Box;
    const last = boxes[boxes.length - 1] as Box;
    const one = boxes.length === 1;
    const gy = Math.max(...boxes.map((b) => b[3])) + 22;
    const xs = last[0] + (last[2] - last[0]) * (one ? 0.72 : 0.5);
    const xe = first[0] + (first[2] - first[0]) * (one ? 0.28 : 0.5);
    L.backs.push({ pts: [xs, last[3], xs, gy, xe, gy, xe, first[3] + 2], badge: [(xs + xe) / 2, gy] });
  }
  return L;
}

