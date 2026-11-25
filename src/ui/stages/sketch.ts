// rough.js shapes for the stage canvas, generated as SVG path data (no DOM) and cached by
// their arguments, so a re-render never regenerates or re-wobbles an unchanged shape.
// @lat: [[design#Where the app departs from this spec]]
import rough from "roughjs";
import type { Options } from "roughjs/bin/core";

const gen = rough.generator();

/**
 * Canvas content colours. Like a whiteboard document they are stored in light-mode values;
 * dark mode inverts the whole canvas layer (--canvas-filter). The Python app palette roles mapped to
 * the app's violet accent and an open-color-style set.
 */
export const INK = {
  text: "#1e1e1e",
  muted: "#6b6b75",
  surface: "#ffffff",
  edge: "#a5a5b0",
  accent: "#6c63ff",
  accentSoft: "#ecebff",
  code: "#1971c2",
  codeSoft: "#e7f2fd",
  fn: "#c026d3",
  fnSoft: "#fbeaff",
  fnLine: "#e9a8f0",
  cancel: "#e03131",
  cancelSoft: "#ffecec",
  cancelLine: "#ffb3b3",
  warn: "#c92a2a",
  /** A/B variants (prompt flags): forks, lane labels and variant badges. */
  ab: "#d9480f",
  abSoft: "#fff4e6",
  abLine: "#ffc078",
} as const;

export interface SketchPath {
  d: string;
  stroke: string;
  fill: string;
  width: number;
  dash?: string;
}

export interface Style {
  stroke?: string;
  fill?: string;
  fillStyle?: "solid" | "hachure";
  width?: number;
  dash?: number[];
  roughness?: number;
  seed: number;
}

const cache = new Map<string, SketchPath[]>();

function draw(key: string, make: () => ReturnType<typeof gen.path>): SketchPath[] {
  const hit = cache.get(key);
  if (hit) return hit;
  const drawable = make();
  const o = drawable.options;
  // Like toPaths(), but keeps the dash pattern on outline sets (rough applies it at paint time).
  const out: SketchPath[] = drawable.sets.map((set) => {
    const d = gen.opsToPath(set, 2);
    if (set.type === "fillPath") return { d, stroke: "none", fill: o.fill ?? "none", width: 0 };
    if (set.type === "fillSketch") return { d, stroke: o.fill ?? "none", fill: "none", width: o.fillWeight };
    return { d, stroke: o.stroke, fill: "none", width: o.strokeWidth, dash: o.strokeLineDash?.join(" ") };
  });
  if (cache.size > 6000) cache.clear();
  cache.set(key, out);
  return out;
}

function opts(s: Style): Options {
  const o: Options = {
    seed: s.seed,
    roughness: s.roughness ?? 1,
    bowing: 0.8,
    stroke: s.stroke ?? "none",
    strokeWidth: s.width ?? 1.4,
    preserveVertices: true,
  };
  if (s.fill) {
    o.fill = s.fill;
    o.fillStyle = s.fillStyle ?? "solid";
    o.hachureGap = 7;
    o.hachureAngle = -41;
    o.fillWeight = 0.8;
  }
  if (s.dash) {
    o.strokeLineDash = s.dash;
    o.disableMultiStroke = true;
  }
  return o;
}

const k = (name: string, nums: number[], s: Style) => `${name}|${nums.map((n) => n.toFixed(1)).join(",")}|${JSON.stringify(s)}`;

/** Rounded-rectangle outline path (smooth); rough.js wobbles it. */
export function roundRectD(x0: number, y0: number, x1: number, y1: number, r: number): string {
  const rr = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  return [
    `M${x0 + rr} ${y0}`,
    `L${x1 - rr} ${y0}`,
    `Q${x1} ${y0} ${x1} ${y0 + rr}`,
    `L${x1} ${y1 - rr}`,
    `Q${x1} ${y1} ${x1 - rr} ${y1}`,
    `L${x0 + rr} ${y1}`,
    `Q${x0} ${y1} ${x0} ${y1 - rr}`,
    `L${x0} ${y0 + rr}`,
    `Q${x0} ${y0} ${x0 + rr} ${y0}`,
    "Z",
  ].join(" ");
}

export function roughRect(x0: number, y0: number, x1: number, y1: number, r: number, s: Style): SketchPath[] {
  return draw(k("rr", [x0, y0, x1, y1, r], s), () => gen.path(roundRectD(x0, y0, x1, y1, r), opts(s)));
}

export function roughLine(points: number[], s: Style): SketchPath[] {
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < points.length; i += 2) pts.push([points[i] as number, points[i + 1] as number]);
  return draw(k("ln", points, s), () => gen.linearPath(pts, opts(s)));
}

/** A polyline with an open arrowhead at its last point. */
export function roughArrow(points: number[], s: Style, head = 8): SketchPath[] {
  const n = points.length;
  const x2 = points[n - 2] as number;
  const y2 = points[n - 1] as number;
  const x1 = points[n - 4] as number;
  const y1 = points[n - 3] as number;
  const a = Math.atan2(y2 - y1, x2 - x1);
  const wing = (da: number) => [x2 - head * Math.cos(a + da), y2 - head * Math.sin(a + da)];
  const tip = [...wing(0.45), x2, y2, ...wing(-0.45)];
  return [...roughLine(points, s), ...roughLine(tip, { ...s, dash: undefined, seed: s.seed + 1 })];
}

export function roughCircle(cx: number, cy: number, d: number, s: Style): SketchPath[] {
  return draw(k("ci", [cx, cy, d], s), () => gen.circle(cx, cy, d, opts(s)) as ReturnType<typeof gen.path>);
}

/** Diagonal hatch for read-only cards (rough hachure, clipped by rough itself). */
export function hatch(x0: number, y0: number, x1: number, y1: number, r: number, s: Style): SketchPath[] {
  return draw(k("ha", [x0, y0, x1, y1, r], s), () => gen.path(roundRectD(x0, y0, x1, y1, r), opts({ ...s, fillStyle: "hachure" })));
}
