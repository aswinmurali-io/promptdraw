// The interactive stage canvas: pan (drag empty space, Space+drag, middle button, wheel,
// two-finger scroll), zoom (Ctrl/Cmd+wheel or trackpad pinch toward the cursor, touch pinch
// around the fingers' midpoint), click to focus /
// select, shift-click and tick boxes to multi-select, drag a card onto a gap or a parallel
// frame (the Python app StageBuilder._press/_motion/_release), and right-click for the context menu.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { wrap } from "../../core";
import { isTyping } from "../lib/keys";
import { Paths, SceneView } from "./SceneView";
import { TagsLayer } from "./TagsLayer";
import { sceneTags } from "./tags";
import { FONTS, cardAnnouncement, cardFocus, dropTarget, ghostLabel, hitOf, measure, stepCard, type DropTarget, type Hit } from "./scene";
import { INK, roughRect } from "./sketch";
import { visibleArea, type StagesController } from "./useStages";
import { gridStep, panBy, pinchView, toScreen, toWorld, wheelZoom, zoomAt, type Pinch, type Rect, type Viewport } from "./viewport";

const DRAG_PX = 5;
const PAN_PX = 4;
const EDGE_X = 40;
/** A card dragged this share of its width snaps to the next gap that moves it. */
const SNAP_SHARE = 0.45;
const EDGE_Y = 30;
/** Keyboard walk over the cards. */
const STEP: Record<string, 1 | -1 | "first" | "last"> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: "first", End: "last" };

/** What a drop where the ghost is would do. */
type DropEffect = "move" | "same" | "refused";

interface Ghost {
  key: string;
  x: number;
  y: number;
  target: DropTarget | null;
  effect: DropEffect;
  /** Released without a move: the ghost glides back onto its card, then goes. */
  returning?: boolean;
}

interface Press {
  id: number;
  hit: Hit | null;
  x: number;
  y: number;
  shift: boolean;
  mode: "click" | "pan" | "drag";
  /** Pan from the start: the button was middle, or Space was held. */
  panOnly: boolean;
  /** While dragging a card: where in the card (world units) it was grabbed. */
  grab?: [number, number];
  /** While dragging a card: the world x where the drag started. */
  startX?: number;
}

export interface StageCanvasProps {
  ctl: StagesController;
  /** A "+" gap or "+ branch" tile was clicked (client coordinates). */
  onAdd: (x: number, y: number, spot: { at: number; loop: string | null } | { par: string }) => void;
  onContextMenu: (x: number, y: number, hit: Hit | null) => void;
}

export function StageCanvas({ ctl, onAdd, onContextMenu }: StageCanvasProps) {
  const { scene, selection, view, setView, surfaceRef } = ctl;
  const tags = useMemo(() => sceneTags(scene), [scene]);
  const press = useRef<Press | null>(null);
  const [space, setSpace] = useState(false);
  const [panning, setPanning] = useState(false);
  // Focus came from the pointer: no viewport focus ring until the keyboard is used again.
  const [pointerFocus, setPointerFocus] = useState(false);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (returnTimer.current) clearTimeout(returnTimer.current);
  }, []);
  const viewRef = useRef(view);
  viewRef.current = view;
  const [announce, setAnnounce] = useState("");
  // Touch: every pointer that is down, and the pinch in progress once two are.
  const pointers = useRef(new Map<number, [number, number]>());
  const pinch = useRef<Pinch | null>(null);

  // Space held: the next drag pans, wherever it starts.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !isTyping(e.target) && !(e.target instanceof HTMLButtonElement)) {
        setSpace(true);
        if (e.target === surfaceRef.current || e.target === document.body) e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpace(false);
    const blur = () => setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [surfaceRef]);

  // Wheel needs a non-passive listener so the page never scrolls or browser-zooms.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
      if (e.ctrlKey || e.metaKey) {
        setView((v) => zoomAt(v, wheelZoom(v.zoom, e.deltaY * unit), e.clientX - r.left, e.clientY - r.top));
        return;
      }
      let dx = e.deltaX * unit;
      let dy = e.deltaY * unit;
      // Like the Task board: the wheel scrolls up and down, Shift+wheel sideways.
      if (e.shiftKey && dx === 0) [dx, dy] = [dy, 0];
      setView((v) => panBy(v, -dx, -dy));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [surfaceRef, setView]);

  const local = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = surfaceRef.current?.getBoundingClientRect();
    return [e.clientX - (r?.left ?? 0), e.clientY - (r?.top ?? 0)];
  };

  const pinchOf = (): Pinch | null => {
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return null;
    return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, dist: Math.hypot(a[0] - b[0], a[1] - b[1]) };
  };

  const endPress = () => {
    press.current = null;
    setPanning(false);
    if (returnTimer.current) clearTimeout(returnTimer.current);
    setGhost(null);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return;
    setPointerFocus(true);
    surfaceRef.current?.focus({ preventScroll: true });
    const [x, y] = local(e);
    pointers.current.set(e.pointerId, [x, y]);
    if (pointers.current.size >= 2) {
      // A second finger turns the gesture into a pinch: drop any click, pan or drag.
      endPress();
      pinch.current = pinchOf();
      return;
    }
    const panOnly = e.button === 1 || space;
    press.current = { id: e.pointerId, hit: panOnly ? null : hitOf(e.target), x, y, shift: e.shiftKey || e.metaKey || e.ctrlKey, mode: panOnly ? "pan" : "click", panOnly };
    if (panOnly) {
      e.preventDefault();
      setPanning(true);
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom / synthetic pointers */
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const [x, y] = local(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, [x, y]);
    if (pinch.current) {
      const from = pinch.current;
      const to = pinchOf();
      if (!to) return;
      pinch.current = to;
      setView((v) => pinchView(v, from, to));
      return;
    }
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    const dist = Math.hypot(x - p.x, y - p.y);
    if (p.mode === "click") {
      const key = p.hit?.key ?? "";
      const draggable = p.hit?.role === "node" && key !== "goal" && key !== "on_cancel" && !key.startsWith("cancel:");
      if (!p.hit && dist >= PAN_PX) {
        p.mode = "pan";
        setPanning(true);
      } else if (draggable && dist >= DRAG_PX) p.mode = "drag";
      else return;
    }
    if (p.mode === "pan") {
      // Read the delta now: React runs the updater later, after p.x / p.y have moved on, so
      // computing it inside the updater would always pan by zero.
      const dx = x - p.x;
      const dy = y - p.y;
      setView((v) => panBy(v, dx, dy));
      p.x = x;
      p.y = y;
      return;
    }
    // Dragging a card: its ghost follows the pointer from where it was grabbed, the card itself
    // fades in place, the nearest gap or parallel frame is marked, and the edges auto-pan.
    const [wx, wy] = toWorld(viewRef.current, x, y);
    const key = p.hit?.key ?? "";
    if (!p.grab) {
      const box = scene.L.cards.get(key);
      const [sx, sy] = toWorld(viewRef.current, p.x, p.y);
      p.grab = box ? [sx - box[0], sy - box[1]] : [24, 16];
      p.startX = sx;
    }
    // The free part of the canvas, between the panels and bars: the ghost stays inside it
    // (never slides under a panel) and nearing its edge auto-pans the board.
    const a = visibleArea(surfaceRef.current);
    const v = viewRef.current;
    const card = scene.L.cards.get(key);
    // The ghost's footprint on screen: the card plus the line under it saying what a drop does,
    // kept a little way off the area's edges so neither is ever cut.
    const [cw, ch] = card ? [(card[2] - card[0]) * v.zoom, (card[3] - card[1]) * v.zoom + GHOST_LABEL_H] : [0, 0];
    const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, Math.max(lo, hi)));
    const gx = clamp(x - p.grab[0] * v.zoom, a.left + GHOST_INSET, a.left + a.width - cw - GHOST_INSET);
    const gy = clamp(y - p.grab[1] * v.zoom, a.top + GHOST_INSET, a.top + a.height - ch - GHOST_INSET);
    const [gwx, gwy] = toWorld(v, gx, gy);
    let target = dropTarget(scene.L, wx, wy);
    let effect = target ? ctl.dropEffect(key, target) : "same";
    // The nearest gap is one of the card's own (a drop there changes nothing), yet the card has
    // travelled most of a card's width: snap to the nearest gap that does move it, in the
    // direction of travel, so a drag released over the next card still reorders.
    const dx = wx - (p.startX ?? wx);
    if (effect === "same" && card && Math.abs(dx) >= (card[2] - card[0]) * SNAP_SHARE) {
      const ahead = scene.L.links
        .map((ln, index) => ({ index, d: ln.cx - wx }))
        .filter(({ index }) => Math.sign(scene.L.links[index]!.cx - (p.startX ?? wx)) === Math.sign(dx))
        .sort((m, n) => Math.abs(m.d) - Math.abs(n.d));
      for (const { index } of ahead) {
        const t = { kind: "link", index } as const;
        if (ctl.dropEffect(key, t) === "move") {
          target = t;
          effect = "move";
          break;
        }
      }
    }
    if (returnTimer.current) clearTimeout(returnTimer.current);
    setGhost({ key, x: gwx, y: gwy, target, effect });
    const ax = x < a.left + EDGE_X ? 12 : x > a.left + a.width - EDGE_X ? -12 : 0;
    const ay = y < a.top + EDGE_Y ? 12 : y > a.top + a.height - EDGE_Y ? -12 : 0;
    if (ax || ay) setView((cur) => panBy(cur, ax, ay));
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      // The pinch ends when a finger lifts; the one left does nothing until it lifts too.
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    press.current = null;
    setPanning(false);
    if (p.mode === "pan") return;
    if (p.mode === "drag") {
      const g = ghost;
      if (g?.target && p.hit && g.effect === "move") {
        setGhost(null);
        ctl.drop(p.hit.key, g.target);
        return;
      }
      // Nothing moves: say why (a refused drop), and glide the ghost back onto its card so the
      // drag reads as "put back", not as a drag that silently failed.
      if (g?.target && p.hit && g.effect === "refused") ctl.drop(p.hit.key, g.target);
      const home = g ? scene.L.cards.get(g.key) : undefined;
      if (!g || !home) {
        setGhost(null);
        return;
      }
      setGhost({ ...g, x: home[0], y: home[1], returning: true });
      returnTimer.current = setTimeout(() => setGhost(null), 220);
      return;
    }
    click(p.hit, p.shift, e.clientX, e.clientY);
  };

  const click = (hit: Hit | null, shift: boolean, cx: number, cy: number) => {
    const sel = selection.sel;
    if (!hit) {
      // Empty space: clear the selection, then the focus (the inspector closes).
      if (sel.length) ctl.clearSelection();
      else ctl.setFocus(null, []);
      return;
    }
    const { role, key } = hit;
    // The A/B tags and lanes: a variant's switches the flags to it, the flag pills open the flags next to the press.
    if (role === "variant") return ctl.chooseVariant(key, { x: cx, y: cy });
    if (role === "flags") return ctl.openFlags(key, { x: cx, y: cy });
    if (role === "del") ctl.remove(key);
    else if (role === "addcancel") ctl.addCancelStage();
    else if (role === "tick") ctl.toggleSel(key);
    else if (role === "plus") {
      const ln = scene.L.links[Number(key)];
      if (ln) onAdd(cx, cy, { at: ln.at, loop: ln.loop });
    } else if (role === "branch") onAdd(cx, cy, { par: key });
    else if (role === "loop" || role === "par") ctl.setFocus({ kind: role, id: key });
    else if (key === "goal") ctl.setFocus({ kind: "goal" });
    else if (key === "on_cancel") ctl.setFocus({ kind: "oncancel" });
    else if (key.startsWith("cancel:")) ctl.setFocus({ kind: "cancel", i: Number(key.slice(7)) });
    // Focus (the accent outline and the inspector) and the ticks that group blocks are two
    // things: a click only focuses, Shift / Ctrl / Cmd + click also ticks or unticks.
    else if (shift) ctl.setFocus({ kind: "block", id: key }, sel.includes(key) ? sel.filter((b) => b !== key) : [...sel, key]);
    else ctl.setFocus({ kind: "block", id: key });
  };

  // Keyboard: arrows walk the cards in reading order, Home / End jump to the ends. The focused
  // card opens the inspector like a click, and its name is announced.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // Enter or Space on a focused A/B tag presses it.
    const tag = e.target instanceof Element ? e.target.closest<SVGElement>("[data-tag]") : null;
    if (tag && (e.key === "Enter" || e.key === " ") && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      const r = tag.getBoundingClientRect();
      click(hitOf(tag), false, r.left + r.width / 2, r.bottom);
      return;
    }
    // Only travel keys turn the keyboard focus ring on; S, P, Delete and the like edit in place.
    if (pointerFocus && (STEP[e.key] !== undefined || e.key === "Tab") && !e.metaKey && !e.ctrlKey) setPointerFocus(false);
    // Enter edits the focused card: the caret goes to the inspector's first field.
    if (e.key === "Enter" && e.target === e.currentTarget && selection.focus && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      ctl.editFocused();
      return;
    }
    const dir = STEP[e.key];
    if (dir === undefined || e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    const key = stepCard(scene.L, selection.focus, dir);
    if (!key) return;
    ctl.setFocus(cardFocus(key));
    ctl.scrollTo(key);
    setAnnounce(cardAnnouncement(scene, key));
  };

  const onContext = (e: React.MouseEvent) => {
    e.preventDefault();
    const hit = hitOf(e.target);
    if (hit?.role === "node" || hit?.role === "tick") {
      const key = hit.key;
      ctl.setFocus(cardFocus(key));
    } else if (hit?.role === "loop" || hit?.role === "par") ctl.setFocus({ kind: hit.role, id: hit.key });
    onContextMenu(e.clientX, e.clientY, hit);
  };

  // The flow's cards off either side of the free area, counted for the "N more" chips. Measured
  // after every commit (a panel opening moves the free area without changing the view) and on
  // window resize.
  const [more, setMore] = useState<MoreInfo>(NO_MORE);
  const [resized, setResized] = useState(0);
  useEffect(() => {
    const on = () => setResized((n) => n + 1);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- every commit, on purpose (see above); setMore bails out when nothing changed
  useLayoutEffect(() => {
    void resized;
    const next = offscreen(scene, view, visibleArea(surfaceRef.current));
    setMore((cur) => (sameMore(cur, next) ? cur : next));
  });

  const transform = `scale(${view.zoom}) translate(${view.scrollX} ${view.scrollY})`;

  return (
    <div
      ref={surfaceRef}
      className="stage-surface"
      tabIndex={0}
      role="application"
      aria-roledescription="stage canvas"
      aria-label="Workflow stages canvas. Arrow keys move between blocks, Enter edits one, Alt plus arrows reorder, Delete removes. Drag empty space to pan, Ctrl or Cmd plus wheel to zoom."
      data-space={space || undefined}
      data-panning={panning || undefined}
      data-pointer={pointerFocus || undefined}
      onBlur={(e) => e.target === e.currentTarget && setPointerFocus(false)}
      data-dragging={ghost && !ghost.returning ? true : undefined}
      data-testid="stage-surface"
      style={{
        backgroundSize: `${gridStep(view.zoom) * view.zoom}px ${gridStep(view.zoom) * view.zoom}px`,
        backgroundPosition: `${view.scrollX * view.zoom}px ${view.scrollY * view.zoom}px`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size < 2) pinch.current = null;
        endPress();
      }}
      onContextMenu={onContext}
      onDoubleClick={(e) => {
        const hit = hitOf(e.target);
        if (hit?.role === "node") ctl.editFocused();
      }}
      onKeyDown={onKeyDown}
    >
      <div className="visually-hidden" aria-live="polite" data-testid="stage-announce">
        {announce}
      </div>
      {!ghost &&
        ([-1, 1] as const).map((dir) => {
          const n = dir < 0 ? more.left : more.right;
          if (!n && !(dir < 0 && more.goalOff)) return null;
          // Only the Goal is off to the left: the chip leads back to the start.
          const noun = (dir < 0 ? more.leftStages : more.rightStages) ? `stage${n === 1 ? "" : "s"}` : `block${n === 1 ? "" : "s"}`;
          const text = n ? `${n} more ${noun}` : "Goal";
          return (
            <button
              key={dir}
              type="button"
              className="flow-more"
              data-side={dir < 0 ? "left" : "right"}
              data-testid={`flow-more-${dir < 0 ? "left" : "right"}`}
              style={{ left: dir < 0 ? more.area.left + 12 : more.area.left + more.area.width - 12, top: more.y }}
              aria-label={n ? `Show ${n} more ${noun} to the ${dir < 0 ? "left" : "right"}` : "Back to the Goal"}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => ctl.page(dir)}
            >
              {dir < 0 && <span aria-hidden="true">←</span>}
              <span>{text}</span>
              {dir > 0 && <span aria-hidden="true">→</span>}
            </button>
          );
        })}
      <svg className="stage-svg" width="100%" height="100%" aria-hidden="true" data-ticking={selection.sel.length > 0 || undefined}>
        <g transform={transform}>
          <SceneView scene={scene} selection={selection} />
          {ghost && <DragOverlay scene={ctl.scene} ghost={ghost} zoom={view.zoom} />}
        </g>
        {ghost && /^[\w:-]+$/.test(ghost.key) && <style>{`.sk-card[data-key="${ghost.key}"]{opacity:.35}`}</style>}
      </svg>
      <TagsLayer tags={tags} transform={transform} />
    </div>
  );
}

/** The flow's cards beyond each side of the free area, and where their chips sit. */
interface MoreInfo {
  left: number;
  right: number;
  /** The Goal (the flow's start) is off the left edge. */
  goalOff: boolean;
  /** Every hidden card on that side is a stage (the chip says "stages", else "blocks"). */
  leftStages: boolean;
  rightStages: boolean;
  /** Screen y of the chips: just under the flow's row, kept inside the free area. */
  y: number;
  area: Rect;
}

const NO_MORE: MoreInfo = { left: 0, right: 0, goalOff: false, leftStages: false, rightStages: false, y: 0, area: { left: 0, top: 0, width: 0, height: 0 } };

function sameMore(a: MoreInfo, b: MoreInfo): boolean {
  if (!a.left && !a.right && !a.goalOff && !b.left && !b.right && !b.goalOff) return true;
  return a.goalOff === b.goalOff && a.left === b.left && a.right === b.right && a.leftStages === b.leftStages && a.rightStages === b.rightStages && Math.abs(a.y - b.y) < 1 && Math.abs(a.area.left - b.area.left) < 1 && Math.abs(a.area.width - b.area.width) < 1;
}

/** Count the flow's cards (not the on-cancel lane) whose middle lies off the free area. */
function offscreen(scene: StagesController["scene"], v: Viewport, area: Rect): MoreInfo {
  let left = 0;
  let right = 0;
  let goalOff = false;
  let leftStages = true;
  let rightStages = true;
  for (const [key, b] of scene.L.cards) {
    if (key === "on_cancel" || key.startsWith("cancel:")) continue;
    if (key === "goal") {
      const [gx] = toScreen(v, (b[0] + b[2]) / 2, b[1]);
      goalOff = gx < area.left;
      continue;
    }
    const [sx] = toScreen(v, (b[0] + b[2]) / 2, b[1]);
    const stage = scene.wf.block(key)?.type === "stage";
    if (sx < area.left) {
      left++;
      leftStages &&= stage;
    } else if (sx > area.left + area.width) {
      right++;
      rightStages &&= stage;
    }
  }
  // Just under the flow's main row (the Goal's), so the chip never covers a card's text.
  const g = scene.L.cards.get("goal");
  let rowBottom = g ? g[3] : 0;
  if (g) for (const b of scene.L.cards.values()) if (b[1] < g[3] && b[3] > g[1]) rowBottom = Math.max(rowBottom, b[3]);
  const gy = g ? toScreen(v, 0, rowBottom)[1] + 28 : area.top + area.height / 2;
  const y = Math.max(area.top + 24, Math.min(area.top + area.height - 24, gy));
  return { left, right, goalOff, leftStages: left > 0 && leftStages, rightStages: right > 0 && rightStages, y, area };
}

/** Screen room the drop line under a ghost takes, and the ghost's margin to the free area's edge. */
const GHOST_LABEL_H = 30;
const GHOST_INSET = 8;

/** What the drag would do, said next to the ghost (short enough to sit under the card). */
const DROP_LABEL: Record<DropEffect, string> = {
  move: "Release to move it here",
  same: "Drop on a gap to reorder",
  refused: "Only stages can run in parallel",
};

/**
 * While a card is dragged: every gap it can land on (faint), the one it would land on (bold,
 * or the group's "+ branch" tile outlined), the ghost card, and a line saying what a drop does.
 */
function DragOverlay({ scene, ghost, zoom }: { scene: StagesController["scene"]; ghost: Ghost; zoom: number }) {
  const { L, wf } = scene;
  const t = ghost.target;
  const b = wf.block(ghost.key);
  const card = L.cards.get(ghost.key);
  const w = card ? card[2] - card[0] : 260;
  const h = card ? card[3] - card[1] : 42;
  const label = b ? (wrap(ghostLabel(b), (s) => measure("name", s), w - 30, 1)[0] as string) : "";
  const live = !ghost.returning;
  const move = live && ghost.effect === "move";
  let mark = null;
  if (!move || !t) mark = null;
  else if (t.kind === "branch") {
    const tile = L.tiles.get(t.par);
    if (tile) mark = <Paths paths={roughRect(tile[0] - 2, tile[1] - 2, tile[2] + 2, tile[3] + 2, 8, { stroke: INK.accent, width: 3, seed: 31, roughness: 0.6 })} />;
  } else {
    const ln = L.links[t.index];
    if (ln) mark = <line x1={ln.cx} y1={ln.y0 - 6} x2={ln.cx} y2={ln.y1 + 6} stroke={INK.accent} strokeWidth={4} strokeLinecap="round" />;
  }
  const tone = ghost.effect === "move" ? INK.accent : ghost.effect === "refused" ? INK.warn : INK.muted;
  return (
    <g className="sk-drag" pointerEvents="none">
      {live &&
        L.links.map((ln, i) => (
          <line key={i} className="sk-drop-gap" x1={ln.cx} y1={ln.y0} x2={ln.cx} y2={ln.y1} stroke={INK.accent} strokeWidth={2} strokeDasharray="3 5" strokeLinecap="round" opacity={0.45} />
        ))}
      {mark}
      <g className="sk-ghost" data-returning={ghost.returning || undefined} style={{ transform: `translate(${ghost.x}px, ${ghost.y}px)` }}>
        {/* Picked up: a solid card on a lifted shadow, so the cards it passes over never show
            through it as a second layer of text. */}
        <g filter="drop-shadow(0 2px 3px rgb(0 0 0 / 0.12)) drop-shadow(0 12px 20px rgb(0 0 0 / 0.18))">
          <path d={`M0 0h${w}v${h}h${-w}z`} fill={INK.surface} />
          <Paths paths={roughRect(0, 0, w, h, 7, { stroke: INK.accent, width: 2, seed: 41, roughness: 0.8 })} />
          <text x={14} y={h / 2} dominantBaseline="central" fill={INK.text} style={{ font: FONTS.name }}>
            {label}
          </text>
        </g>
        {live && (
          // Screen-sized whatever the zoom: the line is read mid-gesture, so it never shrinks.
          <text className="sk-drop-label" x={2} y={h + 22 / zoom} fill={tone} style={{ font: `700 ${15 / zoom}px "Kalam", "Comic Sans MS", cursive` }}>
            {DROP_LABEL[ghost.effect]}
          </text>
        )}
      </g>
    </g>
  );
}
