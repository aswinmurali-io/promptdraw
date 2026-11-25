// Motion helpers: the spec's durations and easings for script-driven animation (Web Animations),
// the "settled" switch that keeps a fresh load calm, and exit ghosts — a removed element's inert
// copy that plays its exit where it stood, so React can unmount at once. Reduced motion (or no
// matchMedia, as in tests) turns every one of them off; CSS motion is switched off in shell.css.
// @lat: [[design#Design language#Motion]]
import { createElement, useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";

export const DUR = { 1: 120, 2: 200, 3: 280 } as const;
export const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
export const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";
/** Exits run about 30% faster than entries. */
export const EXIT = { 1: 90, 2: 120, 3: 200 } as const;

/** Whether to animate: a browser that can say, and has not asked for reduced motion. */
export function motionOK(): boolean {
  if (typeof matchMedia !== "function" || typeof Element === "undefined" || !("animate" in Element.prototype)) return false;
  return !matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Mark the page settled two frames after the first paint (`:root[data-motion]`). Entry
 * animations in CSS wait for it, so a reload draws everything in place and only later changes move.
 */
export function useMotionReady(): void {
  useEffect(() => {
    let b = 0;
    const a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => {
        document.documentElement.setAttribute("data-motion", "on");
        // Turning the switch on starts every CSS entry on what is already drawn: end those now.
        if (typeof document.getAnimations === "function") for (const an of document.getAnimations()) if (an.constructor.name === "CSSAnimation") an.finish();
      });
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, []);
}

/** Whether the page has settled (see useMotionReady). */
export function settled(): boolean {
  return typeof document !== "undefined" && document.documentElement.hasAttribute("data-motion");
}

export interface GhostOptions {
  keyframes: Keyframe[];
  duration?: number;
  /** Fold the ghost's height to nothing as it goes (an element in the flow, like a row). */
  collapse?: boolean;
}

/**
 * Play an exit on an inert copy of `el` in its place; the copy removes itself when done. Call it
 * while `el` is still in the document (a layout-effect cleanup): the copy is taken then, and put
 * in place once `el` has left (nothing happens if it stays).
 */
export function ghost(el: Element | null, { keyframes, duration = EXIT[2], collapse }: GhostOptions, anchor: Element | null = el): void {
  const parent = anchor?.parentNode;
  if (!el || !anchor || !parent || !motionOK() || !settled()) return;
  const copy = el.cloneNode(true) as HTMLElement | SVGElement;
  copy.setAttribute("aria-hidden", "true");
  copy.setAttribute("inert", "");
  copy.removeAttribute("id");
  copy.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  copy.style.pointerEvents = "none";
  copy.dataset.ghost = "";
  const h = collapse && el instanceof HTMLElement ? el.offsetHeight : 0;
  const next = anchor.nextSibling;
  // Only once React has really removed it: a remount (StrictMode's rehearsal) keeps it in place.
  queueMicrotask(() => {
    if (anchor.isConnected || !parent.isConnected) return;
    parent.insertBefore(copy, next && next.parentNode === parent ? next : null);
    let frames = keyframes;
    if (h) {
      copy.style.overflow = "hidden";
      frames = keyframes.map((k, i) => ({ ...k, height: i === 0 ? `${h}px` : "0px" }));
    }
    const anim = copy.animate(frames, { duration, easing: EASE_IN, fill: "forwards" });
    const done = () => copy.remove();
    anim.finished.then(done, done);
  });
}

/** Give a component's root an exit: when it unmounts, its ghost plays `opts` in its place. */
export function useExitGhost(ref: RefObject<Element | null>, opts: GhostOptions): void {
  useLayoutEffect(() => {
    const el = ref.current;
    return () => ghost(el, opts);
    // The options are fixed per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Give conditionally rendered markup an exit without a component of its own: its first element's
 * ghost plays `opts` where it stood. The wrapper is `display: contents`, so layout is unchanged.
 */
export function Exit({ opts, children }: { opts: GhostOptions; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const wrap = ref.current;
    return () => ghost(wrap?.firstElementChild ?? null, opts, wrap);
    // The options are fixed per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return createElement("span", { ref, style: { display: "contents" } }, children);
}

/** Play an entry on `el` with the spec's entry easing (no-op without motion or before settling). */
export function enter(el: Element | null, keyframes: Keyframe[], duration: number = DUR[2], delay = 0): void {
  if (!el || !motionOK() || !settled()) return;
  el.animate(keyframes, { duration, delay, easing: EASE_OUT, fill: "backwards" });
}

/** Common keyframes. */
export const FADE_OUT: Keyframe[] = [{ opacity: 1 }, { opacity: 0 }];
export const POP_OUT: Keyframe[] = [
  { opacity: 1, transform: "scale(1)" },
  { opacity: 0, transform: "scale(0.96)" },
];

function phone(): boolean {
  return typeof matchMedia === "function" && matchMedia("(max-width: 730px)").matches;
}

/**
 * A side panel's motion. On phones it is a sheet: up from below, down to go. Otherwise "right"
 * slides 24px in from the right edge and fades (the Prompt panel, taking the edge), and "pop"
 * grows from 96% (the Settings panel). It plays on mount and each time `shown` turns on; a
 * covered panel's fade-out is CSS (`[hidden]`), an unmounted one's is its ghost.
 */
export function usePanelMotion(ref: RefObject<HTMLElement | null>, shown: boolean, kind: "right" | "pop"): void {
  useLayoutEffect(() => {
    if (!shown) return;
    if (phone()) enter(ref.current, [{ transform: "translateY(100%)" }, { transform: "none" }], DUR[3]);
    else if (kind === "right")
      enter(
        ref.current,
        [
          { opacity: 0, transform: "translateX(24px)" },
          { opacity: 1, transform: "none" },
        ],
        DUR[3],
      );
    else enter(ref.current, POP_IN, DUR[2]);
  }, [ref, shown, kind]);
  useLayoutEffect(() => {
    const el = ref.current;
    return () => {
      if (!el || el.hidden) return;
      ghost(el, phone() ? { keyframes: [{ transform: "none" }, { transform: "translateY(100%)" }], duration: EXIT[3] } : { keyframes: kind === "pop" ? POP_OUT : FADE_OUT, duration: EXIT[2] });
    };
  }, [ref, kind]);
}

export const POP_IN: Keyframe[] = [
  { opacity: 0, transform: "scale(0.96)" },
  { opacity: 1, transform: "scale(1)" },
];

/** The panel holding the right edge now (How to work, the Prompt panel or the stage inspector). */
export function rightPanel(): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(".work-panel, .output-panel, aside.inspector, .demo-panel")) {
    if (el.hasAttribute("data-ghost") || el.hidden) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/**
 * Switching tabs moves the right-hand panel instead of letting it jump: an empty island grows
 * from where the old panel stood to where the new one stands, then the new one fades in over it.
 */
export function morphPanel(from: { rect: DOMRect; radius: string } | null, to: HTMLElement | null): void {
  if (!from || !to || phone() || !motionOK() || !settled()) return;
  const r = to.getBoundingClientRect();
  const a = from.rect;
  if (Math.abs(a.left - r.left) < 2 && Math.abs(a.top - r.top) < 2 && Math.abs(a.width - r.width) < 2 && Math.abs(a.height - r.height) < 2) return;
  const box = document.createElement("div");
  box.className = "panel-morph island";
  box.setAttribute("aria-hidden", "true");
  document.body.appendChild(box);
  const rect = (b: { left: number; top: number; width: number; height: number }, radius: string) => ({ left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px`, borderRadius: radius });
  const anim = box.animate([rect(a, from.radius), rect(r, getComputedStyle(to).borderRadius)], { duration: DUR[3], easing: EASE_OUT, fill: "forwards" });
  to.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR[1], delay: DUR[3] - 60, easing: EASE_OUT, fill: "backwards" });
  const done = () => {
    // Hand over: the box fades as the panel arrives.
    const out = box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR[1], easing: EASE_IN, fill: "forwards" });
    const gone = () => box.remove();
    out.finished.then(gone, gone);
  };
  anim.finished.then(done, () => box.remove());
}
