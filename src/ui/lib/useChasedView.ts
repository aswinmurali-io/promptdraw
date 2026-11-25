// A pan / zoom view whose changes glide: each change sets where the camera is heading, and the
// shown view chases it a little every frame (see chaseView), so wheel, pinch, drag and the zoom
// buttons all move the board smoothly. Instant where motion is off (reduced motion, tests).
// @lat: [[ui#App shell#Canvas#Task board]]
import { useCallback, useEffect, useRef, useState } from "react";
import { chaseView, motionOk, type Viewport } from "../stages/viewport";

export type ViewUpdate = (to: Viewport | ((v: Viewport) => Viewport)) => void;

/** `[shown view, update]`: `update` takes a view, or maps where the camera is heading (not the frame shown now). */
export function useChasedView(initial: () => Viewport): [Viewport, ViewUpdate] {
  const [view, setView] = useState<Viewport>(initial);
  const shown = useRef(view);
  shown.current = view;
  const target = useRef<Viewport | null>(null);
  const frame = useRef<number | null>(null);
  const last = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const update = useCallback<ViewUpdate>((v) => {
    const to = typeof v === "function" ? v(target.current ?? shown.current) : v;
    if (!motionOk()) {
      target.current = null;
      shown.current = to;
      setView(to);
      return;
    }
    target.current = to;
    if (frame.current !== null) return;
    last.current = null;
    const step = (now: number) => {
      const goal = target.current;
      if (!goal) {
        frame.current = null;
        return;
      }
      // The first frame and one after a stall (a background tab) step as one ordinary frame.
      const dt = last.current === null ? 16 : Math.min(64, now - last.current);
      last.current = now;
      const next = chaseView(shown.current, goal, dt);
      shown.current = next;
      setView(next);
      if (next === goal) {
        target.current = null;
        frame.current = null;
      } else frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, []);

  return [view, update];
}
