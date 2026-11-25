// Task-board geometry shared by the board and the app's zoom buttons.
import { clampZoom, type Rect } from "../stages/viewport";

/** Task-board zoom range, as fractions (the zoom island shows percentages). */
export const BOARD_ZOOM_MIN = 0.25;
export const BOARD_ZOOM_MAX = 2;

/** Clamp a zoom to the Task board's range. */
export function boardZoom(z: number): number {
  return Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, clampZoom(z)));
}

/** Visible part of the board (inside the padding that keeps clear of open panels), in board-local pixels. */
export function boardArea(world: HTMLElement | null): Rect {
  const vp = world?.parentElement;
  if (!world || !vp) return { left: 0, top: 0, width: 1, height: 1 };
  const cs = getComputedStyle(world);
  const px = (s: string) => parseFloat(s) || 0;
  const left = px(cs.paddingLeft);
  const top = px(cs.paddingTop);
  return { left, top, width: Math.max(1, vp.clientWidth - left - px(cs.paddingRight)), height: Math.max(1, vp.clientHeight - top - px(cs.paddingBottom)) };
}
