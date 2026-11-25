// Where the "Star on GitHub" ribbon goes: the top-right corner of the free canvas, worked out from
// the islands' boxes so it never covers a panel's close button or a tool.
// @lat: [[ui#Islands]]

export const REPO_URL = "https://github.com/aswinmurali-io/promptdraw";

/** The ribbon's square, in px (matches `.gh-ribbon` in shell.css). */
const SIZE = 128;

/** Everything that can sit in the top band of the window. */
export const ISLANDS = [
  ".region--top-left",
  ".region--top-center .toolbar",
  ".region--top-right",
  ".region--stage-bar",
  ".work-panel",
  ".output-panel",
  ".inspector",
  ".demo-panel",
  ".props-panel",
].join(", ");

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Layout box ignoring transforms (a panel sliding in reports where it will rest); the toolbar,
 *  centred by a transform and never animated, is read from its client rect. */
export function boxOf(el: HTMLElement): Box | null {
  // A closing panel's exit ghost is already gone as far as layout is concerned.
  if (el.hidden || el.closest("[data-ghost]") || !el.offsetWidth || !el.offsetHeight) return null;
  if (el.closest(".region--top-center")) {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }
  return { left: el.offsetLeft, top: el.offsetTop, right: el.offsetLeft + el.offsetWidth, bottom: el.offsetTop + el.offsetHeight };
}

/** The band covers the points of its square with BAND_LO ≤ x − y ≤ BAND_HI: a 24px band centred
 *  on (82, 46), as drawn by `.gh-ribbon-band`, plus a few px of air. */
const BAND_LO = 19 - 4;
const BAND_HI = 53 + 4;

/** Whether an island would sit under the band with the ribbon's right side at `edge`. */
function hits(b: Box, edge: number, size: number): boolean {
  const ox = edge - size;
  const l = Math.max(b.left - ox, 0);
  const r = Math.min(b.right - ox, size);
  const t = Math.max(b.top, 0);
  const bt = Math.min(b.bottom, size);
  if (l >= r || t >= bt) return false;
  // Inside the overlap, x − y runs over [l − bt, r − t].
  return l - bt <= BAND_HI && r - t >= BAND_LO;
}

/**
 * Where the ribbon's right side goes (px from the window's left), or null when it has no room:
 * the window's corner when nothing sits under the band there, else just left of the first island
 * holding the right edge's top that leaves the band clear.
 */
export function ribbonEdge(width: number, boxes: Box[], size = SIZE): number | null {
  const edges = [width, ...boxes.filter((b) => b.top < size && b.right >= width - 24).map((b) => b.left)].sort((a, b) => b - a);
  for (const e of edges) if (e >= size && !boxes.some((b) => hits(b, e, size))) return e;
  return null;
}
