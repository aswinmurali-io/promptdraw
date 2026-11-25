// The stage editor's controller: selection, viewport, the measured scene, every edit
// command, and the workflow library (the Python app's Save / New / Load). The canvas, the inspector
// island and the action registry all drive the editor through this one object, and every
// workflow change goes back to the app store, so undo/redo, autosave and the prompt panel
// behave exactly as for any other edit.
// @lat: [[stages#Controller]]
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Workflow, toYaml, variantChoice, type AnyState, type BlockKind, type Box, type FlagMode, type FlagValues, type WorkflowDict } from "../../core";
import * as E from "./edits";
import type { InsertSpot, StageFocus, StageSelection } from "./edits";
import { fileName, libraryYaml, listLibrary, readEntry, writeEntry, type LibraryEntry } from "./library";
import { buildScene, resetMeasure, sceneBounds, type DropTarget, type Scene } from "./scene";
import { DEFAULT_VIEW, FOCUS_MIN, fitBounds, FOCUS_PAD, chaseView, easeOutCubic, fitFlow, lerpView, homeView, motionOk, opticalCenterY, pageAlong, parseView, sameView, scrollIntoView, stepZoom, toScreen, zoomAt, type Rect, type Viewport } from "./viewport";
import { TEMPLATES, hasKey, fromYaml } from "../../core";
import { STARTERS, starterWorkflow } from "./starters";
import type { PopItem } from "../components/PopMenu";

const NO_FLAGS: FlagValues = {};
export const VIEW_KEY = "promptdraw:stageView";
/** How long a loaded workflow shows whole before the camera glides in, and that glide. */
export const INTRO_HOLD_MS = 450;
export const INTRO_GLIDE_MS = 750;
/** The untouched default workflow, as YAML: a new workflow starts with no unsaved changes. */
const PRISTINE = toYaml(new Workflow({ name: "untitled" }));
/** The Python app keeps a flash message in the status label for 2.2 s. */
export const FLASH_MS = 2200;

export interface ConfirmRequest {
  title: string;
  message: string;
  confirm: string;
  danger?: boolean;
  onConfirm: () => void;
}

export interface StagesDeps {
  workflow: WorkflowDict;
  /** Record a workflow edit (undoable). `coalesce` merges rapid edits of one field. */
  onChange: (next: WorkflowDict, coalesce?: string) => void;
  /** Task-tab state, which a new Intentions block starts from. */
  taskState: AnyState;
  confirm: (req: ConfirmRequest) => void;
  warn: (title: string, items: string[]) => void;
  notify: (text: string, tone?: "info" | "error") => void;
  /** The chosen value of each prompt flag, and how the prompt treats the variants not chosen (flags.ts). */
  flags?: FlagValues;
  flagMode?: FlagMode;
  onFlags?: (flags: FlagValues) => void;
  onFlagMode?: (mode: FlagMode) => void;
}

function loadView(): Viewport | null {
  try {
    return parseView(JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null"));
  } catch {
    return null;
  }
}

function saveView(v: Viewport): void {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(v));
  } catch {
    /* storage blocked: the view just isn't remembered */
  }
}

function hhmm(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** The part of the canvas not covered by islands, in canvas-relative pixels. */
export function visibleArea(surface: HTMLElement | null): Rect {
  const r = surface?.getBoundingClientRect();
  if (!r || !r.width || !r.height) return { left: 0, top: 0, width: 1200, height: 800 };
  let left = r.left;
  let right = r.right;
  let top = r.top;
  let bottom = r.bottom;
  const doc = surface?.ownerDocument ?? document;
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>("[data-inset]"))) {
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    let side = el.dataset.inset;
    // A side panel that spans the screen's width is a phone bottom sheet: it trims the bottom
    // (a tall sheet, such as the 58vh Prompt sheet, starts above the screen's lower two thirds).
    if ((side === "left" || side === "right") && b.width > r.width * 0.6 && b.bottom >= r.bottom - 2 && b.top > r.top) side = "bottom";
    if (side === "left") left = Math.max(left, b.right + 8);
    else if (side === "right") right = Math.min(right, b.left - 8);
    // A bottom bar that sits at the top (the stage bar on tablets) trims the top instead.
    else if (side === "bottom" && b.bottom < r.top + r.height / 2) top = Math.max(top, b.bottom + 8);
    else if (side === "bottom") bottom = Math.min(bottom, b.top - 8);
    // The top bar moves to the bottom edge on phones: then it trims the bottom instead.
    else if (side === "top" && b.top > r.top + r.height / 2) bottom = Math.min(bottom, b.top - 8);
    else if (side === "top") top = Math.max(top, b.bottom + 8);
  }
  if (right - left < 200) [left, right] = [r.left, r.right];
  return { left: left - r.left, top: top - r.top, width: right - left, height: Math.max(100, bottom - top) };
}

/** Scene box key of a focus: the card, loop or parallel frame the inspector is editing. */
function focusBoxKey(f: StageFocus | null): string | null {
  if (!f) return null;
  if (f.kind === "block" || f.kind === "loop" || f.kind === "par") return f.id;
  if (f.kind === "goal") return "goal";
  if (f.kind === "oncancel") return "on_cancel";
  if (f.kind === "cancel") return `cancel:${f.i}`;
  return null;
}

function union(boxes: Box[]): Box {
  return boxes.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
}

/** Whether `v` shows world box `box` whole inside `area`. */
function showsWhole(v: Viewport, box: Box, area: Rect): boolean {
  const [sx0, sy0] = toScreen(v, box[0], box[1]);
  const [sx1, sy1] = toScreen(v, box[2], box[3]);
  return sx0 >= area.left && sy0 >= area.top && sx1 <= area.left + area.width && sy1 <= area.top + area.height;
}

function sameRect(a: Rect, b: Rect): boolean {
  return Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;
}

/**
 * The free part of the canvas changed from `prev` to `area` (a panel opened, closed or was
 * resized). Keep in view what was in view: the whole flow when it showed whole, else the cards
 * that did, panning the least that fits them in the new area. When they no longer fit at this
 * zoom the view stays put (the focused card is revealed separately).
 */
export function reframe(v: Viewport, L: Scene["L"], prev: Rect, area: Rect): Viewport {
  const all = sceneBounds(L);
  const seen = showsWhole(v, all, prev) ? [all] : [...L.cards.values()].filter((b) => showsWhole(v, b, prev));
  if (!seen.length) return v;
  const box = union(seen);
  const m = 24;
  if ((box[2] - box[0]) * v.zoom + 2 * m > area.width || (box[3] - box[1]) * v.zoom + 2 * m > area.height) return v;
  return showsWhole(v, box, area) ? v : scrollIntoView(v, box, area, m);
}

/** How far past a card its own trailing gap button may sit and still belong to it. */
const TAIL_REACH = 90;

/**
 * The box to bring into view for `key` (a card, loop or parallel frame), widened to take in the
 * gap button (+) just after it, so a revealed last card never leaves its + on a panel's edge.
 */
export function revealBox(L: Scene["L"], key: string): Box | undefined {
  const b = L.cards.get(key) ?? L.loops.get(key) ?? L.pars.get(key);
  if (!b) return undefined;
  let x1 = b[2];
  for (const ln of L.links) {
    if (ln.cy >= b[1] && ln.cy <= b[3] && ln.cx > b[2] && ln.cx - b[2] <= TAIL_REACH) x1 = Math.max(x1, ln.cx + 16);
  }
  return x1 === b[2] ? b : [b[0], b[1], x1, b[3]];
}

/**
 * What Fit frames when it can't show the whole flow: the card for `key` with its neighbours on
 * the same row (the cards just before and after it), so the focused card is read in context.
 * When the three don't fit `area` even at FOCUS_MIN, the card alone, so it is never the one cut
 * off.
 */
export function fitAnchor(L: Scene["L"], key: string | null, area?: Rect): Box | undefined {
  const b = key ? revealBox(L, key) : undefined;
  if (!b) return undefined;
  const row = [...L.cards.values()].filter((c) => c !== L.cards.get(key!) && c[1] < b[3] && c[3] > b[1]);
  const before = row.filter((c) => c[2] <= b[0]).sort((p, q) => q[2] - p[2])[0];
  const after = row.filter((c) => c[0] >= b[2] - 1).sort((p, q) => p[0] - q[0])[0];
  const wide = union([b, ...(before ? [before] : []), ...(after ? [after] : [])]);
  return area && !fitsAt(wide, area, FOCUS_MIN, FOCUS_PAD) ? b : wide;
}

/** Whether world box `box` fits inside `area` at zoom `z` with `m` pixels to spare all round. */
function fitsAt(box: Box, area: Rect, z: number, m: number): boolean {
  return (box[2] - box[0]) * z + 2 * m <= area.width && (box[3] - box[1]) * z + 2 * m <= area.height;
}

/** `v` at its zoom, panned so world box `box` sits in the middle of `area` (its optical centre). */
export function centerOn(v: Viewport, box: Box, area: Rect): Viewport {
  const cx = area.left + area.width / 2;
  const cy = opticalCenterY(area);
  return { zoom: v.zoom, scrollX: cx / v.zoom - (box[0] + box[2]) / 2, scrollY: cy / v.zoom - (box[1] + box[3]) / 2 };
}

/** How far (a share of the free area's width) a closing panel may pan to bring the Goal back. */
export const GOAL_PULL = 0.4;

/** Room kept clear around a centred flow, so no card or trailing + crowds a panel's edge. */
export const FRAME_PAD = 48;

/**
 * The lowest zoom an automatic move may ease out to so a flow that showed whole stays whole:
 * just below 100%, where card type still reads and edits comfortably.
 */
export const AUTO_ZOOM_MIN = 0.8;

/** How long a zoom-button step (or Ctrl/Cmd +, -, 0) glides: quick enough to press repeatedly. */
export const ZOOM_GLIDE_MS = 200;

/**
 * Where the camera goes after the free area changed or the flow grew, at the zoom of `v`.
 *  - `center` (the whole flow showed before): keep it whole, centred in the free area with
 *    FRAME_PAD all round; when it no longer fits at this zoom, ease out just enough to fit, but
 *    never below AUTO_ZOOM_MIN (below that card type is too small to edit by).
 *  - The whole flow `all` fits: show it whole, panning the least.
 *  - Otherwise `box` (the block just added or focused) comes into view first, and the Goal, the
 *    anchor of the flow, joins it when both fit; with nothing to reveal the Goal stays in view
 *    if it was before, and comes back when it is at most GOAL_PULL of the width away.
 */
export function frameFlow(v: Viewport, all: Box, area: Rect, opts: { goal?: Box; box?: Box; keepGoal?: boolean; center?: boolean }, m = 24): Viewport {
  if (opts.center) {
    // A zoom between AUTO_ZOOM_MIN and 100% is one an earlier automatic move eased out to:
    // it springs back toward 100% once there is room again.
    const pref = v.zoom >= FOCUS_MIN && v.zoom < 1 ? 1 : v.zoom;
    const fitZ = Math.min((area.width - 2 * FRAME_PAD) / Math.max(1, all[2] - all[0]), (area.height - 2 * FRAME_PAD) / Math.max(1, all[3] - all[1]));
    const z = Math.min(pref, Math.floor(fitZ * 100) / 100);
    if (z >= AUTO_ZOOM_MIN) return centerOn({ ...v, zoom: z }, all, area);
    if (pref !== v.zoom) v = zoomAt(v, pref, area.left + area.width / 2, opticalCenterY(area));
  }
  if (fitsAt(all, area, v.zoom, m)) return showsWhole(v, all, area) ? v : scrollIntoView(v, all, area, m);
  const { goal, box, keepGoal } = opts;
  let out = box && !showsWhole(v, box, area) ? scrollIntoView(v, box, area, 32) : v;
  if (goal && !showsWhole(out, goal, area)) {
    if (box) {
      const both = union([goal, box]);
      if (fitsAt(both, area, v.zoom, m)) out = scrollIntoView(out, both, area, m);
    } else {
      // Nothing to reveal (the inspector closed): bring the Goal back when it showed before, or
      // when it is only a short pan away, so a short flow reads from its start.
      const near = scrollIntoView(out, goal, area, m);
      if (keepGoal || Math.abs(near.scrollX - out.scrollX) * v.zoom <= area.width * GOAL_PULL) out = near;
    }
  }
  return out;
}

/** A floating menu the editor shows (add menu, context menu, Load ▾). */
export interface StageMenu {
  x: number;
  y: number;
  /** Opens upward from `y` (a tool in the bottom bar). */
  above?: boolean;
  label: string;
  items: PopItem[];
}

export interface StagesController {
  workflow: WorkflowDict;
  scene: Scene;
  selection: StageSelection;
  view: Viewport;
  surfaceRef: RefObject<HTMLDivElement>;
  /** Increments when the inspector should focus its first field (the Python app `first_field`). */
  fieldToken: number;
  status: string;
  dirty: boolean;
  /** Nothing is open: the board holds the empty default workflow. */
  blank: boolean;
  hint: string;
  canLoop: boolean;
  canPar: boolean;
  change: (next: WorkflowDict, coalesce?: string) => void;
  setView: (v: Viewport | ((cur: Viewport) => Viewport)) => void;
  setFocus: (f: StageFocus | null, sel?: string[]) => void;
  toggleSel: (id: string) => void;
  clearSelection: () => void;
  selectAll: () => void;
  /** Add a block and focus it. `edit` (the default, for menu picks) also puts the caret in its
   *  first field; a key or toolbar add leaves focus where it is, so the next key adds again. */
  insert: (spot: InsertSpot, kind: BlockKind, template: string | null, edit?: boolean) => void;
  /** Put the caret in the inspector's first field (Enter or a double-click on a card). */
  editFocused: () => void;
  remove: (key: string) => void;
  removeFocused: () => void;
  move: (id: string, d: number) => void;
  moveFocused: (d: number) => void;
  drop: (id: string, target: DropTarget) => void;
  /** What dropping `id` on `target` would do: move it, leave it where it is, or be refused. */
  dropEffect: (id: string, target: DropTarget) => "move" | "same" | "refused";
  /** Loop / run in parallel the ticked blocks, or `ids` (a right-clicked card). */
  makeLoop: (ids?: string[]) => void;
  makePar: (ids?: string[]) => void;
  removeLoop: (lid: string) => void;
  ungroup: (pid: string) => void;
  addCancelStage: () => void;
  moveCancel: (i: number, d: number) => void;
  fit: () => void;
  /** Glide the board sideways toward the flow's cards off screen (the "N more" chips). */
  page: (dir: 1 | -1) => void;
  zoomBy: (dir: 1 | -1) => void;
  zoomReset: () => void;
  scrollTo: (key: string) => void;
  flash: (msg: string) => void;
  library: () => LibraryEntry[];
  save: () => void;
  newWorkflow: () => void;
  loadEntry: (name: string) => void;
  /** Open one of the built-in starter workflows (unsaved until Save). */
  loadStarter: (key: string) => void;
  /** Ask before replacing a workflow with unsaved changes (the Python app `_discard_ok`). */
  discardOk: (then: () => void) => void;
  /** A workflow came in from a file: reset the saved baseline and fit it. */
  loaded: (wf?: WorkflowDict) => void;
  menu: StageMenu | null;
  openMenu: (m: StageMenu) => void;
  closeMenu: () => void;
  /** The prompt flag values in use; a flag not named keeps its declared default. */
  flags: FlagValues;
  flagMode: FlagMode;
  setFlag: (name: string, value: boolean | string) => void;
  setFlagMode: (mode: FlagMode) => void;
  /** The stage bar's Flags popover. */
  flagsOpen: boolean;
  /** Open or close the popover where the stage bar puts it (the stage bar's Flags tool and the palette). */
  setFlagsOpen: (open: boolean) => void;
  /** Where the popover was opened from on the canvas (a tag's press), and the flag it opens focused on; null when it sits above the stage bar. */
  flagsAt: FlagsAnchor | null;
  /** Open the popover next to a point on screen, focused on one flag. */
  openFlags: (flag?: string, at?: { x: number; y: number }) => void;
  /** Switch the flags so block `id`'s variant is the chosen one; when no single value does that, open the popover on its flag. */
  chooseVariant: (id: string, at?: { x: number; y: number }) => void;
}

export interface FlagsAnchor {
  flag: string;
  x: number;
  y: number;
}

export function useStages(deps: StagesDeps): StagesController {
  const { workflow } = deps;
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const wfRef = useRef(workflow);
  wfRef.current = workflow;

  const surfaceRef = useRef<HTMLDivElement>(null);
  const [selection, setSelectionState] = useState<StageSelection>(E.NO_SELECTION);
  const selRef = useRef(selection);
  selRef.current = selection;
  const storedView = useRef(loadView());
  const [view, setViewState] = useState<Viewport>(() => storedView.current ?? DEFAULT_VIEW);
  const [needsFit, setNeedsFit] = useState(storedView.current === null);
  const [fontTick, setFontTick] = useState(0);
  const [fieldToken, setFieldToken] = useState(0);
  const [flashMsg, setFlashMsg] = useState<string | null>(null);
  const [savedYaml, setSavedYaml] = useState<string | null>(() => libraryYaml(workflow.name));
  // What "no changes" means for a workflow that isn't in the library: the empty default, or
  // the workflow as a file brought it in. Only the badge and the discard guard use it.
  const [baseYaml, setBaseYaml] = useState<string>(PRISTINE);
  const pendingScroll = useRef<string | null>(null);
  const [menu, setMenu] = useState<StageMenu | null>(null);
  const [flagsOpen, setFlagsOpenRaw] = useState(false);
  const [flagsAt, setFlagsAt] = useState<FlagsAnchor | null>(null);
  const setFlagsOpen = useCallback((open: boolean) => {
    setFlagsOpenRaw(open);
    setFlagsAt(null);
  }, []);
  const openFlags = useCallback((flag = "", at?: { x: number; y: number }) => {
    setFlagsOpenRaw(true);
    setFlagsAt(at ? { flag, x: at.x, y: at.y } : flag ? { flag, x: Number.NaN, y: Number.NaN } : null);
  }, []);
  const flags = deps.flags ?? NO_FLAGS;
  const flagMode = deps.flagMode ?? "embed";

  // Re-measure once the web fonts arrive so wrapped lines match what is drawn.
  useEffect(() => {
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    let live = true;
    fonts?.ready?.then(() => {
      if (!live) return;
      resetMeasure();
      setFontTick((t) => t + 1);
    });
    return () => {
      live = false;
    };
  }, []);

  const scene = useMemo(() => {
    void fontTick;
    return buildScene(workflow, flags, flagMode);
  }, [workflow, flags, flagMode, fontTick]);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  // Undo / redo or a reload can remove what is focused.
  const pruned = useMemo(() => E.pruneSelection(workflow, selection), [workflow, selection]);
  useEffect(() => {
    if (pruned !== selection) setSelectionState(pruned);
  }, [pruned, selection]);

  // Running view animation (zoom to fit, a reframe); any direct view change by the user
  // cancels it. `goal` is where a running glide is heading, so a reframe that lands while one
  // is in flight builds on its destination rather than on a frame half way there.
  const anim = useRef<number | null>(null);
  const goal = useRef<Viewport | null>(null);
  // The running animation is a chase (wheel, pinch, drag: see setView) rather than a glide.
  const chasing = useRef(false);
  // A loaded workflow opens on the whole flow, holds, then glides in (see the opening view).
  const intro = useRef(false);
  const introTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopAnim = useCallback(() => {
    if (introTimer.current !== null) clearTimeout(introTimer.current);
    introTimer.current = null;
    if (anim.current !== null) cancelAnimationFrame(anim.current);
    anim.current = null;
    goal.current = null;
    chasing.current = false;
  }, []);
  useEffect(() => stopAnim, [stopAnim]);
  const viewNow = useRef(view);
  viewNow.current = view;

  // The view is the one Fit chose and nobody has panned or zoomed since: while it is, a panel
  // opening or closing (or the flow changing size) fits again for the new free area rather than
  // leaving the flow squeezed to one side or cut off under the panel.
  const fitted = useRef(false);
  // A direct view change (wheel, pinch, drag, edge auto-pan) moves where the camera is heading;
  // the shown view chases it a little each frame, so the board glides instead of jumping. A
  // change while a glide runs takes over from the frame on screen, aimed past the glide's end.
  const setView = useCallback(
    (v: Viewport | ((cur: Viewport) => Viewport)) => {
      fitted.current = false;
      // Panning or zooming during a load's overview keeps the user's view: no glide in after.
      if (introTimer.current !== null) clearTimeout(introTimer.current);
      introTimer.current = null;
      const base = goal.current ?? viewNow.current;
      const to = typeof v === "function" ? v(base) : v;
      if (!motionOk()) {
        stopAnim();
        viewNow.current = to;
        setViewState(to);
        return;
      }
      if (anim.current !== null && !chasing.current) cancelAnimationFrame(anim.current);
      else if (anim.current !== null) {
        goal.current = to;
        return;
      }
      goal.current = to;
      chasing.current = true;
      let last: number | null = null;
      const step = (now: number) => {
        const g = goal.current;
        if (!g) return;
        const dt = last === null ? 16 : Math.min(64, now - last);
        last = now;
        const next = chaseView(viewNow.current, g, dt);
        viewNow.current = next;
        setViewState(next);
        if (next === g) stopAnim();
        else anim.current = requestAnimationFrame(step);
      };
      anim.current = requestAnimationFrame(step);
    },
    [stopAnim],
  );
  // Only a view the canvas has actually shown is worth remembering: saving the untouched
  // default (before the opening fit) would bring back an empty corner of the board next time.
  useEffect(() => {
    if (needsFit) return;
    const t = setTimeout(() => saveView(view), 300);
    return () => clearTimeout(t);
  }, [view, needsFit]);

  /** Move the camera to `to` in a short ease-out glide (instant with reduced motion). */
  const glide = useCallback(
    (to: Viewport, area: Rect, ms = 320) => {
      const from = viewNow.current;
      stopAnim();
      const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduce || typeof requestAnimationFrame === "undefined") {
        setViewState(to);
        return;
      }
      goal.current = to;
      const sx = area.left + area.width / 2;
      const sy = area.top + area.height / 2;
      let start: number | null = null;
      const step = (now: number) => {
        start ??= now;
        const t = Math.min(1, (now - start) / ms);
        setViewState(t >= 1 ? to : lerpView(from, to, easeOutCubic(t), sx, sy));
        anim.current = t >= 1 ? null : requestAnimationFrame(step);
        if (t >= 1) goal.current = null;
      };
      anim.current = requestAnimationFrame(step);
    },
    [stopAnim],
  );

  const fit = useCallback(() => {
    const area = visibleArea(surfaceRef.current);
    const L = sceneRef.current.L;
    const key = focusBoxKey(selRef.current.focus);
    fitted.current = true;
    glide(fitFlow(sceneBounds(L), area, fitAnchor(L, key, area)), area);
  }, [glide]);

  const page = useCallback(
    (dir: 1 | -1) => {
      const area = visibleArea(surfaceRef.current);
      const base = goal.current ?? viewNow.current;
      fitted.current = false;
      glide(pageAlong(base, sceneBounds(sceneRef.current.L), area, dir), area);
    },
    [glide],
  );

  // The canvas fills the window behind the islands, so the part left free by the panels is the
  // real viewport. Each commit (no deps on purpose: the canvas mounts only on the Stages tab and
  // panels open and resize without telling this hook) compares that free area and the focus
  // with the last ones seen:
  //  - the canvas just mounted (the tab opened) or a workflow was loaded: the opening view,
  //    unless a remembered view still shows a card of the flow whole;
  //  - a panel opened, closed or was resized: the cards that showed whole before stay in view
  //    (the smallest pan that does it), so an opening panel never hides what you were looking at;
  //  - a block was added or focused: only if it is off screen, pan the least to bring it in.
  // Selecting a card that is already visible, or dropping one in place, never moves the board.
  const mounted = useRef<HTMLDivElement | null>(null);
  const lastArea = useRef<Rect | null>(null);
  const lastFocus = useRef<string | null>(null);
  const lastBounds = useRef<Box | null>(null);
  const focusKey = focusBoxKey(pruned.focus);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = surfaceRef.current;
    const fresh = el !== mounted.current;
    mounted.current = el;
    const prevFocus = lastFocus.current;
    lastFocus.current = focusKey;
    if (!el) {
      lastArea.current = null;
      return;
    }
    const L = sceneRef.current.L;
    const area = visibleArea(el);
    const prevArea = lastArea.current;
    lastArea.current = area;
    const all = sceneBounds(L);
    const prevBounds = lastBounds.current;
    lastBounds.current = all;
    // The on-cancel lane alone doesn't count: it is not the flow.
    const flow = [...L.cards].filter(([k]) => k !== "on_cancel" && !k.startsWith("cancel:"));
    if (needsFit || (fresh && !flow.some(([, b]) => showsWhole(view, b, area)))) {
      setNeedsFit(false);
      fitted.current = false;
      pendingScroll.current = null;
      stopAnim();
      const home = homeView(all, area);
      const overview = fitBounds(all, area);
      const showIntro = intro.current;
      intro.current = false;
      // A workflow just loaded or opened: show all of it first so its shape reads, then glide
      // into the opening view. Skipped when the whole flow already shows at about that zoom.
      if (showIntro && motionOk() && overview.zoom < home.zoom * 0.9) {
        setViewState(overview);
        introTimer.current = setTimeout(() => {
          introTimer.current = null;
          glide(home, visibleArea(surfaceRef.current), INTRO_GLIDE_MS);
        }, INTRO_HOLD_MS);
        return;
      }
      setViewState(home);
      return;
    }
    const scrollKey = pendingScroll.current;
    pendingScroll.current = null;
    const moved = !fresh && prevArea !== null && !sameRect(prevArea, area);
    const grew = !fresh && prevBounds !== null && prevBounds.some((n, i) => Math.abs(n - all[i]!) >= 1);
    const reveal = scrollKey ?? (focusKey !== prevFocus ? focusKey : null);
    if (!moved && !grew && !reveal) return;
    const base = goal.current ?? viewNow.current;
    if (fitted.current && (moved || grew)) {
      // Still the view Fit chose: fit again for the new free area, around what is focused.
      const key = reveal ?? focusKey;
      const v = fitFlow(all, area, fitAnchor(L, key, area));
      if (!sameView(v, base)) glide(v, area, 260);
      return;
    }
    // The whole flow was on screen before this change: keep it that way, so an opening
    // inspector or a new block never leaves the Goal or a stage cut off at a panel's edge.
    const wasWhole = prevArea !== null && prevBounds !== null && showsWhole(base, prevBounds, prevArea);
    let v = moved && prevArea ? reframe(base, L, prevArea, area) : base;
    // The opening view enlarges a short flow; once it outgrows the free area (a block was added
    // or a panel opened), ease back toward 100% rather than leave cards cut at the panel edges.
    if (v.zoom > 1) {
      const z = Math.max(1, Math.min(v.zoom, Math.floor(((area.width - 64) / Math.max(1, all[2] - all[0])) * 20) / 20));
      if (z < v.zoom - 0.01) v = zoomAt(v, z, area.left + area.width / 2, area.top + area.height / 2);
    }
    const box = reveal ? revealBox(L, reveal) : undefined;
    if (moved || grew) {
      // A panel opened or closed, or a block was added: never leave the Goal or a stage as a
      // sliver at a panel's edge when the whole flow fits at this zoom.
      const goalBox = L.cards.get("goal");
      const goalShown = !!goalBox && prevArea !== null && showsWhole(base, goalBox, prevArea);
      // A flow that showed whole is re-centred in the free area (a panel opening or closing, a
      // block added), so it never stays packed against one edge with the other side empty.
      // A flow that grew or shrank (a block added or removed) is shown whole again whenever it
      // fits at a readable zoom, even if it had been panned part way: a short flow never stays
      // half off screen behind a "1 more stage" chip.
      // Likewise when a panel closes (the inspector folding away on the right): the room it gives
      // back brings a flow that now fits at a readable zoom whole into view again, Goal first.
      const roomier = moved && prevArea !== null && area.width > prevArea.width + 1;
      const readable = (grew || roomier) && fitsAt(all, area, AUTO_ZOOM_MIN, FRAME_PAD);
      // The inspector folding away on the right with nothing left to reveal: read the flow from
      // its start again, Goal first, rather than stay parked on the last stage edited.
      const inspectorClosed = roomier && !box && area.left + area.width > prevArea!.left + prevArea!.width + 1;
      v = frameFlow(v, all, area, { goal: goalBox, box, keepGoal: goalShown || wasWhole || inspectorClosed, center: wasWhole || readable });
      // A panel opened beside a focused card (the inspector, often with the Prompt panel open
      // too) and left its neighbours cut off at an edge: ease out, no further than FOCUS_MIN,
      // so the card is read between the cards before and after it rather than as a sliver.
      const ctx = moved && reveal ? fitAnchor(L, reveal, area) : undefined;
      if (ctx && !showsWhole(v, ctx, area)) v = fitFlow(all, area, ctx);
    } else if (box) v = scrollIntoView(v, box, area, 32);
    if (!sameView(v, base)) glide(v, area, 260);
  });

  // Keyboard travel: glide the least amount that brings the card into the free area.
  const scrollTo = useCallback((key: string) => {
    const box = revealBox(sceneRef.current.L, key);
    if (!box) return;
    const base = goal.current ?? viewNow.current;
    const area = visibleArea(surfaceRef.current);
    const to = scrollIntoView(base, box, area, 32);
    if (!sameView(to, base)) glide(to, area, ZOOM_GLIDE_MS);
  }, [glide]);

  useEffect(() => {
    if (!flashMsg) return;
    const t = setTimeout(() => setFlashMsg(null), FLASH_MS);
    return () => clearTimeout(t);
  }, [flashMsg]);

  const change = useCallback((next: WorkflowDict, coalesce?: string) => depsRef.current.onChange(next, coalesce), []);
  const setSelection = useCallback((s: StageSelection) => setSelectionState(s), []);
  const setFocus = useCallback((focus: StageFocus | null, sel?: string[]) => setSelection({ focus, sel: sel ?? selRef.current.sel }), [setSelection]);
  const flash = useCallback((msg: string) => setFlashMsg(msg), []);

  // The "unsaved changes" badge may lag a keystroke: serialising a large workflow on every
  // key would make typing in the inspector stutter. Save and discard checks use fresh YAML.
  const deferredWorkflow = useDeferredValue(workflow);
  const currentYaml = useMemo(() => toYaml(new Workflow(deferredWorkflow)), [deferredWorkflow]);
  const dirty = (savedYaml ?? baseYaml) !== currentYaml;
  const checks = useMemo(() => E.groupChecks(workflow, selection.sel), [workflow, selection.sel]);
  const hint = useMemo(() => E.selectionHint(workflow, selection.sel), [workflow, selection.sel]);

  const insert = useCallback(
    (spot: InsertSpot, kind: BlockKind, template: string | null, edit = true) => {
      const { wf, id } = E.insertBlock(wfRef.current, spot, kind, template, depsRef.current.taskState);
      change(wf);
      // Focused, not ticked: ticks are only ever set by hand.
      setSelection({ focus: { kind: "block", id }, sel: selRef.current.sel });
      pendingScroll.current = id;
      if (template && hasKey(TEMPLATES, template)) flash("Added " + TEMPLATES[template].name);
      else if (edit) setFieldToken((t) => t + 1);
    },
    [change, setSelection, flash],
  );

  const remove = useCallback(
    (key: string) => {
      const s = selRef.current;
      if (key.startsWith("cancel:")) {
        change(E.removeCancelStage(wfRef.current, Number(key.slice(7))));
        setSelection({ focus: { kind: "oncancel" }, sel: s.sel });
        return;
      }
      change(E.removeBlock(wfRef.current, key));
      const focus = s.focus?.kind === "block" && s.focus.id === key ? null : s.focus;
      setSelection({ focus, sel: s.sel.filter((b) => b !== key) });
    },
    [change, setSelection],
  );

  const removeFocused = useCallback(() => {
    const f = selRef.current.focus;
    if (f?.kind === "block") remove(f.id);
    else if (f?.kind === "cancel") remove(`cancel:${f.i}`);
  }, [remove]);

  const move = useCallback((id: string, d: number) => change(E.moveBlock(wfRef.current, id, d)), [change]);
  const moveFocused = useCallback(
    (d: number) => {
      const f = selRef.current.focus;
      if (f?.kind === "block" && E.canMove(wfRef.current, f.id, d)) move(f.id, d);
      else if (f?.kind === "cancel") {
        const r = E.moveCancelStage(wfRef.current, f.i, d);
        change(r.wf);
        setFocus({ kind: "cancel", i: r.i });
      }
    },
    [move, change, setFocus],
  );

  const dropSpot = useCallback((target: DropTarget) => {
    if (target.kind === "branch") return { kind: "branch", par: target.par } as const;
    const ln = sceneRef.current.L.links[target.index];
    return ln ? ({ kind: "link", at: ln.at, loop: ln.loop } as const) : null;
  }, []);

  const dropEffect = useCallback(
    (id: string, target: DropTarget) => {
      const t = dropSpot(target);
      if (!t) return "same" as const;
      const r = E.dropBlock(wfRef.current, id, t);
      if (!r.ok) return "refused" as const;
      return toYaml(new Workflow(r.wf)) === toYaml(new Workflow(wfRef.current)) ? ("same" as const) : ("move" as const);
    },
    [dropSpot],
  );

  const drop = useCallback(
    (id: string, target: DropTarget) => {
      const t = dropSpot(target);
      if (!t) return;
      const r = E.dropBlock(wfRef.current, id, t);
      // The selection stays as it was: a drop moves a card, it doesn't open the inspector.
      if (!r.ok) depsRef.current.notify("Only stages can run in parallel", "error");
      else change(r.wf);
    },
    [change, dropSpot],
  );

  const makeLoop = useCallback((ids?: string[]) => {
    const r = E.makeLoop(wfRef.current, ids ?? selRef.current.sel);
    if (!r.id) return;
    change(r.wf);
    setSelection({ focus: { kind: "loop", id: r.id }, sel: [] });
  }, [change, setSelection]);

  const makePar = useCallback((ids?: string[]) => {
    const r = E.makePar(wfRef.current, ids ?? selRef.current.sel);
    if (!r.id) return;
    change(r.wf);
    setSelection({ focus: { kind: "par", id: r.id }, sel: [] });
  }, [change, setSelection]);

  const removeLoop = useCallback(
    (lid: string) => {
      const r = E.removeLoop(wfRef.current, lid);
      change(r.wf);
      setFocus(r.first ? { kind: "block", id: r.first } : null);
    },
    [change, setFocus],
  );

  const ungroup = useCallback(
    (pid: string) => {
      const r = E.ungroup(wfRef.current, pid);
      change(r.wf);
      setFocus(r.first ? { kind: "block", id: r.first } : null);
    },
    [change, setFocus],
  );

  const addCancelStage = useCallback(() => {
    const r = E.addCancelStage(wfRef.current);
    change(r.wf);
    setFocus({ kind: "cancel", i: r.i });
    pendingScroll.current = `cancel:${r.i}`;
    setFieldToken((t) => t + 1);
  }, [change, setFocus]);

  const moveCancel = useCallback(
    (i: number, d: number) => {
      const r = E.moveCancelStage(wfRef.current, i, d);
      change(r.wf);
      setFocus({ kind: "cancel", i: r.i });
    },
    [change, setFocus],
  );

  // Zoom buttons and Ctrl/Cmd +/-/0 glide to the new zoom around the free area's centre. A press
  // while a glide runs steps from where it is heading, so quick presses add up instead of
  // restarting from a frame half way there.
  const zoomBy = useCallback(
    (dir: 1 | -1) => {
      fitted.current = false;
      const a = visibleArea(surfaceRef.current);
      const base = goal.current ?? viewNow.current;
      glide(zoomAt(base, stepZoom(base.zoom, dir), a.left + a.width / 2, a.top + a.height / 2), a, ZOOM_GLIDE_MS);
    },
    [glide],
  );
  const zoomReset = useCallback(() => {
    fitted.current = false;
    const a = visibleArea(surfaceRef.current);
    const base = goal.current ?? viewNow.current;
    glide(zoomAt(base, 1, a.left + a.width / 2, a.top + a.height / 2), a, ZOOM_GLIDE_MS);
  }, [glide]);

  // ---------------------------------------------------------------- files
  const discardOk = useCallback(
    (then: () => void) => {
      const wf = wfRef.current;
      const isDirty = (savedYaml ?? baseYaml) !== toYaml(new Workflow(wf));
      if (!isDirty || (!wf.blocks.length && !wf.goal.trim())) return then();
      depsRef.current.confirm({ title: "Unsaved changes", message: `Discard unsaved changes to '${wf.name}'?`, confirm: "Discard", danger: true, onConfirm: then });
    },
    [savedYaml, baseYaml],
  );

  const replace = useCallback(
    (next: WorkflowDict, saved: string | null) => {
      change(next);
      setSavedYaml(saved);
      setBaseYaml(toYaml(new Workflow(next)));
      setSelection(E.NO_SELECTION);
      intro.current = true;
      setNeedsFit(true);
    },
    [change, setSelection],
  );

  const save = useCallback(() => {
    const wf = new Workflow(wfRef.current);
    const text = toYaml(wf);
    const file = "workflows/" + fileName(wf.name);
    const write = () => {
      if (!writeEntry(wf.name, text)) {
        depsRef.current.warn("Couldn't save", [`${file}: the browser blocked storage or it is full. Export the YAML instead.`]);
        return;
      }
      setSavedYaml(text);
      flash(`Saved ${file} at ${hhmm()}`);
    };
    const onDisk = readEntry(wf.name) ? libraryYaml(wf.name) : null;
    if (readEntry(wf.name) && onDisk !== savedYaml && onDisk !== text) {
      depsRef.current.confirm({ title: "Overwrite?", message: `${file} already exists. Replace it?`, confirm: "Replace", danger: true, onConfirm: write });
    } else write();
  }, [savedYaml, flash]);

  const newWorkflow = useCallback(() => discardOk(() => replace(new Workflow({ name: "untitled" }).toDict(), null)), [discardOk, replace]);

  const loadEntry = useCallback(
    (name: string) =>
      discardOk(() => {
        const e = readEntry(name);
        if (!e) return;
        let wf: Workflow;
        let warnings: string[];
        try {
          [wf, warnings] = fromYaml(e.yaml);
        } catch (err) {
          depsRef.current.warn("Couldn't load workflow", [`${fileName(name)}: ${(err as Error).message}`]);
          return;
        }
        const same = wf.name === e.name;
        replace(wf.toDict(), same ? toYaml(wf) : null);
        if (warnings.length) depsRef.current.warn("Loaded with changes", warnings);
        flash("Loaded " + fileName(name));
      }),
    [discardOk, replace, flash],
  );

  const loadStarter = useCallback(
    (key: string) =>
      discardOk(() => {
        const wf = starterWorkflow(key);
        if (!wf) return;
        replace(wf, null);
        flash("Opened the " + (STARTERS.find((s) => s.key === key)?.label ?? key) + " template");
      }),
    [discardOk, replace, flash],
  );

  const loaded = useCallback((wf?: WorkflowDict) => {
    setSavedYaml(null);
    setBaseYaml(wf ? toYaml(new Workflow(wf)) : PRISTINE);
    setSelection(E.NO_SELECTION);
    intro.current = true;
    setNeedsFit(true);
  }, [setSelection]);

  // A workflow that was never saved and has no changes says nothing: there is nothing to warn about.
  const status = flashMsg ?? (dirty ? "● unsaved changes" : savedYaml !== null ? "saved" : "");

  return {
    workflow,
    scene,
    selection: pruned,
    view,
    surfaceRef,
    fieldToken,
    status,
    dirty,
    blank: currentYaml === PRISTINE,
    hint,
    canLoop: checks.loop[0],
    canPar: checks.par[0],
    change,
    setView,
    setFocus,
    toggleSel: (id) => {
      const s = selRef.current;
      setSelection({ ...s, sel: s.sel.includes(id) ? s.sel.filter((b) => b !== id) : [...s.sel, id] });
    },
    clearSelection: () => setSelection({ ...selRef.current, sel: [] }),
    selectAll: () => setSelection({ ...selRef.current, sel: new Workflow(wfRef.current).ids() }),
    insert,
    editFocused: () => setFieldToken((t) => t + 1),
    remove,
    removeFocused,
    move,
    moveFocused,
    drop,
    dropEffect,
    makeLoop,
    makePar,
    removeLoop,
    ungroup,
    addCancelStage,
    moveCancel,
    fit,
    page,
    zoomBy,
    zoomReset,
    scrollTo,
    flash,
    library: listLibrary,
    save,
    newWorkflow,
    loadEntry,
    loadStarter,
    discardOk,
    loaded,
    menu,
    openMenu: setMenu,
    closeMenu: () => setMenu(null),
    flags,
    flagMode,
    setFlag: (name, value) => depsRef.current.onFlags?.({ ...(depsRef.current.flags ?? NO_FLAGS), [name]: value }),
    setFlagMode: (mode) => depsRef.current.onFlagMode?.(mode),
    flagsOpen,
    setFlagsOpen,
    flagsAt,
    openFlags,
    chooseVariant: (id, at) => {
      const d = depsRef.current;
      const pick = variantChoice(new Workflow(d.workflow), d.flags, id);
      if (!pick) return openFlags("", at);
      if (pick.already) return;
      if (pick.value === null) return openFlags(pick.flag, at);
      d.onFlags?.({ ...(d.flags ?? NO_FLAGS), [pick.flag]: pick.value });
    },
  };
}
