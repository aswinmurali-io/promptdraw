// The Task tab as a whiteboard: the cards float on a board that pans and zooms like the stage
// canvas. Drag anywhere that isn't a text field to pan (a drag that starts on a button or card
// pans and swallows its click), or Space+drag / middle-drag from anywhere; wheel and two-finger
// scroll pan, Ctrl/Cmd+wheel and trackpad or touch pinch zoom toward the pointer. A click on
// empty board leaves any text field. The board can't be flung out of sight (keepInView).
// @lat: [[ui#Canvas#Task board]]
import { useCallback, useEffect, useRef, useState, type FocusEvent as ReactFocusEvent, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { isTyping } from "../lib/keys";
import { boardArea, boardZoom } from "../lib/board";
import { keepInView, panBy, pinchView, scrollIntoView, toWorld, wheelZoom, zoomAt, type Pinch, type Viewport } from "../stages/viewport";

const PAN_PX = 4;

/** Text fields keep the pointer for caret placement and selection. */
const TEXT = "textarea, input:not([type=checkbox]):not([type=radio]):not([type=button]), select, [contenteditable=''], [contenteditable=true]";

interface Press {
  id: number;
  x: number;
  y: number;
  panning: boolean;
}

export interface TaskBoardProps {
  view: Viewport;
  setView: (fn: (v: Viewport) => Viewport) => void;
  children: ReactNode;
}

export function TaskBoard({ view, setView, children }: TaskBoardProps) {
  const vpRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const press = useRef<Press | null>(null);
  const pointers = useRef(new Map<number, [number, number]>());
  const pinch = useRef<Pinch | null>(null);
  const swallowClick = useRef(false);
  const [space, setSpace] = useState(false);
  const [panning, setPanning] = useState(false);

  /** Apply a view change, then keep the sheet partly on screen. */
  const update = useCallback(
    (fn: (v: Viewport) => Viewport) => {
      const sheet = sheetRef.current;
      const area = boardArea(worldRef.current);
      setView((v) => {
        const next = fn(v);
        if (!sheet) return next;
        const box: [number, number, number, number] = [sheet.offsetLeft, sheet.offsetTop, sheet.offsetLeft + sheet.offsetWidth, sheet.offsetTop + sheet.offsetHeight];
        return keepInView(next, box, area);
      });
    },
    [setView],
  );

  const local = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = vpRef.current?.getBoundingClientRect();
    return [e.clientX - (r?.left ?? 0), e.clientY - (r?.top ?? 0)];
  };

  // Space held (outside text fields): the next drag pans, wherever it starts.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || isTyping(e.target) || e.target instanceof HTMLButtonElement) return;
      setSpace(true);
      if (e.target === document.body || vpRef.current?.contains(e.target as Node)) e.preventDefault();
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
  }, []);

  // Wheel: non-passive so the page never scrolls or browser-zooms. A text field that can still
  // scroll that way keeps the wheel.
  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        update((v) => zoomAt(v, boardZoom(wheelZoom(v.zoom, e.deltaY)), e.clientX - r.left, e.clientY - r.top));
        return;
      }
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
      let dx = e.deltaX * unit;
      let dy = e.deltaY * unit;
      if (e.shiftKey && dx === 0) [dx, dy] = [dy, 0];
      const field = e.target instanceof Element ? e.target.closest<HTMLElement>("textarea, .scrolls") : null;
      if (field) {
        const canY = dy < 0 ? field.scrollTop > 0 : dy > 0 && field.scrollTop + field.clientHeight < field.scrollHeight - 1;
        const canX = dx < 0 ? field.scrollLeft > 0 : dx > 0 && field.scrollLeft + field.clientWidth < field.scrollWidth - 1;
        if (canY || canX) return;
      }
      e.preventDefault();
      update((v) => panBy(v, -dx, -dy));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [update]);

  // A drag that started on a button or card must not also press it.
  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener("click", onClick, true);
    return () => el.removeEventListener("click", onClick, true);
  }, []);

  const pinchOf = (): Pinch | null => {
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return null;
    return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, dist: Math.hypot(a[0] - b[0], a[1] - b[1]) };
  };

  const startPan = (e: ReactPointerEvent<HTMLDivElement>) => {
    setPanning(true);
    window.getSelection()?.removeAllRanges();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointers */
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return;
    swallowClick.current = false;
    const [x, y] = local(e);
    if (e.pointerType === "touch") {
      pointers.current.set(e.pointerId, [x, y]);
      if (pointers.current.size >= 2) {
        press.current = null;
        setPanning(false);
        pinch.current = pinchOf();
        return;
      }
    }
    const panOnly = e.button === 1 || space;
    const inText = e.target instanceof Element && e.target.closest(TEXT) !== null;
    if (!panOnly && (inText || e.button !== 0)) return;
    press.current = { id: e.pointerId, x, y, panning: panOnly };
    const onControl = e.target instanceof Element && e.target.closest("button, label, a, input, [role=button]") !== null;
    if (panOnly) {
      e.preventDefault();
      startPan(e);
    } else if (!onControl) {
      // Empty board: no text selection, and the press doesn't steal focus until it's a click.
      e.preventDefault();
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
      update((v) => {
        const next = pinchView(v, from, to);
        const z = boardZoom(next.zoom);
        return z === next.zoom ? next : zoomAt(next, z, to.x, to.y);
      });
      return;
    }
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    if (!p.panning) {
      if (Math.hypot(x - p.x, y - p.y) < PAN_PX) return;
      p.panning = true;
      startPan(e);
    }
    const dx = x - p.x;
    const dy = y - p.y;
    p.x = x;
    p.y = y;
    update((v) => panBy(v, dx, dy));
  };

  const endPress = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    press.current = null;
    setPanning(false);
    if (p.panning) {
      swallowClick.current = !cancelled;
      return;
    }
    // A plain click on empty board leaves the text field being edited.
    const t = e.target instanceof Element ? e.target : null;
    if (!cancelled && t && !t.closest("button, label, a, input, [role=button]")) {
      const a = document.activeElement;
      if (a instanceof HTMLElement && vpRef.current?.contains(a)) a.blur();
    }
  };

  // Tabbing to a field that's off screen brings it into view.
  const onFocus = (e: ReactFocusEvent<HTMLDivElement>) => {
    const vp = vpRef.current;
    if (!vp || press.current || !(e.target instanceof HTMLElement)) return;
    const r = e.target.getBoundingClientRect();
    const o = vp.getBoundingClientRect();
    const area = boardArea(worldRef.current);
    update((v) => {
      const [x0, y0] = toWorld(v, r.left - o.left, r.top - o.top);
      const [x1, y1] = toWorld(v, r.right - o.left, Math.min(r.bottom, r.top + 160) - o.top);
      return scrollIntoView(v, [x0, y0, x1, y1], area, 24);
    });
  };

  return (
    <div
      ref={vpRef}
      className="task-viewport"
      data-testid="task-board"
      data-space={space || undefined}
      data-panning={panning || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endPress(e, false)}
      onPointerCancel={(e) => endPress(e, true)}
      onFocus={onFocus}
    >
      <div
        ref={worldRef}
        className="task-world"
        data-testid="task-world"
        data-zoom={Math.round(view.zoom * 100)}
        style={{ transform: `scale(${view.zoom}) translate(${view.scrollX}px, ${view.scrollY}px)` }}
      >
        <div ref={sheetRef} className="canvas-sheet">
          {children}
        </div>
      </div>
    </div>
  );
}
