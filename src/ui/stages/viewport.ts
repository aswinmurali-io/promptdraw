// Pan / zoom for the infinite stage canvas, as pure math. A point in world space (the layout's
// pixels) appears on screen at (world + scroll) * zoom, relative to the canvas element.
// @lat: [[stages#Canvas]]

export interface Viewport {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.1;
/** Largest wheel delta one event counts (exp(0.1) ≈ 10.5% zoom). */
export const WHEEL_CAP = 10;
export const DEFAULT_VIEW: Viewport = { scrollX: 0, scrollY: 0, zoom: 1 };

export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

export function toWorld(v: Viewport, sx: number, sy: number): [number, number] {
  return [sx / v.zoom - v.scrollX, sy / v.zoom - v.scrollY];
}

export function toScreen(v: Viewport, wx: number, wy: number): [number, number] {
  return [(wx + v.scrollX) * v.zoom, (wy + v.scrollY) * v.zoom];
}

/** Zoom to `zoom`, keeping the world point under screen point (sx, sy) where it is. */
export function zoomAt(v: Viewport, zoom: number, sx: number, sy: number): Viewport {
  const z = clampZoom(zoom);
  const [wx, wy] = toWorld(v, sx, sy);
  return { zoom: z, scrollX: sx / z - wx, scrollY: sy / z - wy };
}

/** Button / key zoom: one 10% step, snapped to the step grid. */
export function stepZoom(z: number, dir: 1 | -1): number {
  const snapped = Math.round(z / ZOOM_STEP) * ZOOM_STEP;
  const next = Math.abs(snapped - z) < 1e-6 ? z + dir * ZOOM_STEP : dir > 0 ? Math.ceil(z / ZOOM_STEP) * ZOOM_STEP : Math.floor(z / ZOOM_STEP) * ZOOM_STEP;
  return clampZoom(Math.round(next * 100) / 100);
}

/** Ctrl/Cmd + wheel or trackpad pinch: proportional to the wheel delta for the small deltas
 *  of a pinch, and capped at about 10% per event so one mouse-wheel notch (deltaY 100) is a
 *  whiteboard-sized step rather than a jump. */
export function wheelZoom(z: number, deltaY: number): number {
  const d = Math.max(-WHEEL_CAP, Math.min(WHEEL_CAP, deltaY));
  return clampZoom(z * Math.exp(-d * 0.01));
}

/** Two touch points: their midpoint (screen pixels) and the distance between them. */
export interface Pinch {
  x: number;
  y: number;
  dist: number;
}

/** Two-finger pinch: scale by the change in finger distance, and keep the world point that
 *  was under the old midpoint under the new one (so the gesture also pans). */
export function pinchView(v: Viewport, from: Pinch, to: Pinch): Viewport {
  const z = clampZoom(v.zoom * (to.dist / Math.max(1, from.dist)));
  const [wx, wy] = toWorld(v, from.x, from.y);
  return { zoom: z, scrollX: to.x / z - wx, scrollY: to.y / z - wy };
}

/** Pan by a screen-pixel delta. */
export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  return { ...v, scrollX: v.scrollX + dx / v.zoom, scrollY: v.scrollY + dy / v.zoom };
}

/** View `t` (0..1) of the way from `a` to `b`, for animated moves such as zoom-to-fit.
 *  Zoom moves geometrically (even speed in/out) and the world point under screen point
 *  (sx, sy) moves in a straight line, so the camera glides instead of swinging. */
export function lerpView(a: Viewport, b: Viewport, t: number, sx: number, sy: number): Viewport {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const zoom = a.zoom * Math.pow(b.zoom / a.zoom, t);
  const [ax, ay] = toWorld(a, sx, sy);
  const [bx, by] = toWorld(b, sx, sy);
  const wx = ax + (bx - ax) * t;
  const wy = ay + (by - ay) * t;
  return { zoom, scrollX: sx / zoom - wx, scrollY: sy / zoom - wy };
}

/**
 * How quickly the shown view catches up with where wheel, pinch and drag sent it (ms): the time
 * constant of an exponential chase, so about 95% of the way there after three of these.
 */
export const CHASE_MS = 60;

/**
 * The screen point that stays put going from `a` to `b` (the cursor of a wheel zoom, the
 * centre of a pinch). A pure pan has none; any point works then, so the origin.
 */
export function fixedPoint(a: Viewport, b: Viewport): [number, number] {
  const k = 1 / a.zoom - 1 / b.zoom;
  if (Math.abs(a.zoom - b.zoom) <= a.zoom * 1e-6) return [0, 0];
  return [(a.scrollX - b.scrollX) / k, (a.scrollY - b.scrollY) / k];
}

/** `a` and `b` are within a quarter pixel and a hair of zoom of each other. */
export function closeView(a: Viewport, b: Viewport): boolean {
  return Math.abs(a.zoom - b.zoom) <= b.zoom * 1e-4 && Math.abs(a.scrollX - b.scrollX) * b.zoom < 0.25 && Math.abs(a.scrollY - b.scrollY) * b.zoom < 0.25;
}

/**
 * One frame of the chase: `dt` ms later, `cur` moves part way toward `target` (exponentially,
 * so the step is the same whatever the frame rate), around the point the move keeps still, so a
 * wheel zoom stays anchored on the cursor all the way. Lands exactly on `target` once close.
 */
export function chaseView(cur: Viewport, target: Viewport, dt: number, tau = CHASE_MS): Viewport {
  if (closeView(cur, target)) return target;
  const [fx, fy] = fixedPoint(cur, target);
  const next = lerpView(cur, target, 1 - Math.exp(-Math.max(0, dt) / tau), fx, fy);
  return closeView(next, target) ? target : next;
}

/** Animate the camera: a real browser with motion allowed (not jsdom, not reduced motion). */
export function motionOk(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function" || typeof requestAnimationFrame === "undefined") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Ease-out cubic: quick start, soft landing. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
}

/** Fit world box [x0, y0, x1, y1] into `area` (screen pixels), never zooming past 100%. */
export function fitBounds(box: [number, number, number, number], area: Rect, pad = 32): Viewport {
  const [x0, y0, x1, y1] = box;
  const bw = Math.max(1, x1 - x0);
  const bh = Math.max(1, y1 - y0);
  const aw = Math.max(1, area.width - 2 * pad);
  const ah = Math.max(1, area.height - 2 * pad);
  const zoom = clampZoom(Math.min(1, aw / bw, ah / bh));
  const cx = area.left + area.width / 2;
  const cy = area.top + area.height / 2;
  return { zoom, scrollX: cx / zoom - (x0 + bw / 2), scrollY: cy / zoom - (y0 + bh / 2) };
}

/**
 * The lowest zoom Fit goes to: 80%, where a card's eyebrow (12px) and name (16px) still read
 * at about 10px and 13px on screen and the inspector's edits can be checked on the card. Past
 * this point Fit stops shrinking and pans instead: it frames the focused card (or the Goal) and
 * marks the stages left off screen on each side with a "N more" chip that pages to them.
 */
export const FIT_MIN = 0.8;

/**
 * The lowest zoom the camera eases to so a focused card reads with both neighbours when side
 * panels leave a narrow strip of board (the inspector and the Prompt panel both open on a
 * laptop): 70%, where a card's 16px name still reads at about 11px. Below it the card alone
 * is framed and the rest is counted on the "N more" chips.
 */
export const FOCUS_MIN = 0.7;

/** Room kept around a focused card and its neighbours when they are framed below FIT_MIN. */
export const FOCUS_PAD = 20;

/**
 * Zoom to fit, but never so far out the cards can't be read. A flow that fits `area` at
 * FIT_MIN or more is shown whole and centred (as fitBounds). A longer one is shown at FIT_MIN,
 * centred on `anchor` (the focused card with its neighbours; the flow's start when there is
 * none) and then slid so no empty board shows past either end of the flow while there is more
 * of it to see. When the anchor doesn't fit at FIT_MIN (a narrow strip between two panels),
 * the zoom eases out further, to no less than FOCUS_MIN, until it does; if the whole flow
 * fits at that zoom it is shown whole instead.
 */
export function fitFlow(box: [number, number, number, number], area: Rect, anchor?: [number, number, number, number], pad = 32): Viewport {
  const whole = fitBounds(box, area, pad);
  if (whole.zoom >= FIT_MIN) return whole;
  let zoom = FIT_MIN;
  if (anchor) {
    const fa = Math.min((area.width - 2 * FOCUS_PAD) / Math.max(1, anchor[2] - anchor[0]), (area.height - 2 * FOCUS_PAD) / Math.max(1, anchor[3] - anchor[1]));
    if (fa < FIT_MIN && fa >= FOCUS_MIN) {
      zoom = Math.floor(fa * 100) / 100;
      const all = fitBounds(box, area, FOCUS_PAD);
      if (all.zoom >= zoom) return all;
    }
  }
  const a = anchor ?? [box[0], box[1], box[0], box[3]];
  // One axis: the scroll that puts world span [b0, b1] in screen span [lo, hi].
  const axis = (b0: number, b1: number, a0: number, a1: number, lo: number, hi: number): number => {
    const mid = (lo + hi) / 2;
    if ((b1 - b0) * zoom <= hi - lo - 2 * pad) return mid / zoom - (b0 + b1) / 2;
    const s = mid / zoom - (a0 + a1) / 2;
    // The flow's start no further in than lo + pad, its end no further in than hi - pad.
    return Math.max(Math.min(s, (lo + pad) / zoom - b0), (hi - pad) / zoom - b1);
  };
  return {
    zoom,
    scrollX: axis(box[0], box[2], a[0], a[2], area.left, area.left + area.width),
    scrollY: axis(box[1], box[3], a[1], a[3], area.top, area.top + area.height),
  };
}

/**
 * How far the opening view may enlarge a short flow: not at all, so an empty or short flow opens
 * at the same 100% as a populated one and adding the first stage never shrinks the type.
 */
export const HOME_ZOOM_MAX = 1;

/**
 * Where a centred flow's middle sits vertically: a little above the free area's centre, the
 * optical centre, so a short flow doesn't read as sinking toward the bottom bar.
 */
export const OPTICAL_RISE = 0.04;

/** Screen y of the optical centre of `area`. */
export function opticalCenterY(area: Rect): number {
  return area.top + area.height * (0.5 - OPTICAL_RISE);
}

/**
 * Opening view for a workflow: at the optical centre vertically, at a readable zoom (fit the
 * height, between FIT_MIN and 100%) rather than shrinking a long flow to fit its whole width. A
 * flow that fits across `area` is centred (never enlarged past HOME_ZOOM_MAX); a longer one
 * starts at the left.
 */
export function homeView(box: [number, number, number, number], area: Rect, pad = 32): Viewport {
  const [x0, y0, x1, y1] = box;
  const bh = Math.max(1, y1 - y0);
  const bw = Math.max(1, x1 - x0);
  const fitH = (area.height - 2 * pad) / bh;
  const fitW = (area.width - 2 * pad) / bw;
  // Past 100% only while the whole flow still fits both ways.
  const zoom = clampZoom(Math.max(FIT_MIN, Math.min(fitH, fitW >= 1 ? Math.min(HOME_ZOOM_MAX, fitW) : 1)));
  const fits = bw * zoom <= area.width - 2 * pad;
  const scrollX = fits ? (area.left + area.width / 2) / zoom - (x0 + bw / 2) : (area.left + pad) / zoom - x0;
  return { zoom, scrollX, scrollY: opticalCenterY(area) / zoom - (y0 + bh / 2) };
}

/** Grid spacing in world pixels: doubles while zoomed out so dots stay at least 12px apart. */
export function gridStep(zoom: number, base = 20): number {
  let step = base;
  while (step * zoom < 12 && step < base * 64) step *= 2;
  return step;
}

/** Pan the least amount that brings world box `box` fully into `area` (the Python app `_scroll_to`). */
export function scrollIntoView(v: Viewport, box: [number, number, number, number], area: Rect, margin = 60): Viewport {
  const [sx0, sy0] = toScreen(v, box[0], box[1]);
  const [sx1, sy1] = toScreen(v, box[2], box[3]);
  let dx = 0;
  let dy = 0;
  if (sx0 < area.left) dx = area.left + margin - sx0;
  else if (sx1 > area.left + area.width) dx = Math.max(area.left + area.width - margin - sx1, area.left + margin - sx0);
  if (sy0 < area.top) dy = area.top + margin - sy0;
  else if (sy1 > area.top + area.height) dy = Math.max(area.top + area.height - margin - sy1, area.top + margin - sy0);
  return dx || dy ? panBy(v, dx, dy) : v;
}

export function sameView(a: Viewport, b: Viewport): boolean {
  return a.zoom === b.zoom && a.scrollX === b.scrollX && a.scrollY === b.scrollY;
}

/** Parse a stored viewport, or null when it is missing or broken. */
export function parseView(raw: unknown): Viewport | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (![v.scrollX, v.scrollY, v.zoom].every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  return { scrollX: v.scrollX as number, scrollY: v.scrollY as number, zoom: clampZoom(v.zoom as number) };
}

/**
 * Pan the least amount that keeps at least `margin` screen pixels of world box `box` inside
 * `area` on each axis (or all of it, when it is smaller), so a board can't be flung out of
 * sight. The zoom is unchanged.
 */
export function keepInView(v: Viewport, box: [number, number, number, number], area: Rect, margin = 96): Viewport {
  const [sx0, sy0] = toScreen(v, box[0], box[1]);
  const [sx1, sy1] = toScreen(v, box[2], box[3]);
  const fix = (a0: number, a1: number, lo: number, hi: number): number => {
    const m = Math.min(margin, a1 - a0, hi - lo);
    if (a1 < lo + m) return lo + m - a1;
    if (a0 > hi - m) return hi - m - a0;
    return 0;
  };
  const dx = fix(sx0, sx1, area.left, area.left + area.width);
  const dy = fix(sy0, sy1, area.top, area.top + area.height);
  return dx || dy ? panBy(v, dx, dy) : v;
}

/**
 * Page a long flow sideways: pan about 80% of the free width toward `dir` (1 shows more to the
 * right, -1 more to the left), but never past the flow's end, which stops `pad` pixels inside
 * the area's edge. The zoom is unchanged.
 */
export function pageAlong(v: Viewport, box: [number, number, number, number], area: Rect, dir: 1 | -1, pad = 48): Viewport {
  const [sx0] = toScreen(v, box[0], box[1]);
  const [sx1] = toScreen(v, box[2], box[3]);
  const step = area.width * 0.8;
  const dx = dir > 0 ? Math.min(0, Math.max(-step, area.left + area.width - pad - sx1)) : Math.max(0, Math.min(step, area.left + pad - sx0));
  return dx ? panBy(v, dx, 0) : v;
}
