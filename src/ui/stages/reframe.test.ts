import { describe, expect, it } from "vitest";
import type { Box } from "../../core";
import { reframe, revealBox } from "./useStages";
import type { Scene } from "./scene";
import type { Rect } from "./viewport";

function layout(cards: [string, Box][]): Scene["L"] {
  return { cards: new Map(cards), loops: new Map(), pars: new Map(), forks: new Map(), shelf: null, backs: [], links: [], width: 0, height: 0 } as unknown as Scene["L"];
}

const full: Rect = { left: 0, top: 0, width: 1400, height: 800 };

describe("reframe (a panel changed the free part of the canvas)", () => {
  it("pans the least that keeps a flow that showed whole in view", () => {
    const L = layout([["goal", [0, 0, 200, 60]], ["b1", [300, 0, 500, 60]]]);
    const v = { scrollX: 100, scrollY: 300, zoom: 1 };
    // An inspector opens over the left 420px: the flow (screen x 100..600) slides right.
    const out = reframe(v, L, full, { left: 420, top: 0, width: 980, height: 800 });
    expect(out.zoom).toBe(1);
    expect((0 + out.scrollX) * out.zoom).toBeGreaterThanOrEqual(420);
    expect(out.scrollY).toBe(300);
  });

  it("leaves the view alone when nothing it showed gets covered", () => {
    const L = layout([["goal", [0, 0, 200, 60]]]);
    const v = { scrollX: 600, scrollY: 300, zoom: 1 };
    expect(reframe(v, L, full, { left: 420, top: 0, width: 980, height: 800 })).toBe(v);
  });

  it("keeps the visible cards when the whole flow didn't show", () => {
    const L = layout([["a", [-2000, 0, -1800, 60]], ["b", [0, 0, 200, 60]], ["c", [300, 0, 500, 60]]]);
    const v = { scrollX: 100, scrollY: 300, zoom: 1 };
    const out = reframe(v, L, full, { left: 420, top: 0, width: 980, height: 800 });
    expect((0 + out.scrollX) * out.zoom).toBeGreaterThanOrEqual(420);
  });

  it("does not move when what showed no longer fits", () => {
    const L = layout([["b", [0, 0, 900, 60]]]);
    const v = { scrollX: 100, scrollY: 300, zoom: 1 };
    expect(reframe(v, L, full, { left: 420, top: 0, width: 600, height: 800 })).toBe(v);
  });
});

describe("revealBox", () => {
  it("takes in the + just after a card, not one a card further on", () => {
    const L = layout([["b1", [0, 0, 200, 60]], ["b2", [300, 0, 500, 60]]]);
    (L as { links: unknown[] }).links = [
      { cx: 250, cy: 30, y0: 0, y1: 60, at: 1, loop: null },
      { cx: 550, cy: 30, y0: 0, y1: 60, at: 2, loop: null },
    ];
    expect(revealBox(L, "b2")).toEqual([300, 0, 566, 60]);
    expect(revealBox(L, "b1")).toEqual([0, 0, 266, 60]);
    expect(revealBox(L, "nope")).toBeUndefined();
  });
});
