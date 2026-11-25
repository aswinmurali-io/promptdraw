// The docked stage inspector's width: a floor that leaves room to write a prompt, and a default
// share of the window until it is first resized.
// @lat: [[stages#Stage editor#Islands and menus]]
import { INSPECTOR_MAX, INSPECTOR_MIN, SIDE_W } from "../../core";

/**
 * The docked panel is never narrower than this (px), so a prompt has room to be written in. The
 * stored `inspector_w` keeps the Python app's own 260 floor; this one is the browser's.
 */
export const DOCK_MIN = 440;
/** Until it is resized (the stored width is still the Python app's default), the panel takes this share of the window. */
export const DOCK_SHARE = 0.4;

const winW = () => (typeof window === "undefined" ? 1440 : window.innerWidth);

/**
 * The Python app `set_side_width` clamp (… max(300, window − 480), never past 1400), floored at DOCK_MIN.
 * A width still at the Python app's default (`SIDE_W`) means "never resized" and follows the window.
 */
export function clampWidth(w: number, windowW = winW()): number {
  const want = w === SIDE_W ? windowW * DOCK_SHARE : w;
  const max = Math.min(Math.max(300, windowW - 480), INSPECTOR_MAX);
  return Math.round(Math.max(INSPECTOR_MIN, Math.min(Math.max(want, DOCK_MIN), max)));
}

