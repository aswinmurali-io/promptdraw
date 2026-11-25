import { describe, expect, it } from "vitest";
import { sample } from "../../test/fixtures";
import { buildScene, dropTarget, sceneBounds, seedOf } from "./scene";
import { AUTO_ZOOM_MIN, FRAME_PAD, frameFlow } from "./useStages";
import { DEFAULT_VIEW, FIT_MIN, FOCUS_MIN, pageAlong, chaseView, clampZoom, closeView, easeOutCubic, fixedPoint, lerpView, fitBounds, fitFlow, homeView, OPTICAL_RISE, keepInView, panBy, parseView, pinchView, scrollIntoView, stepZoom, toScreen, toWorld, wheelZoom, zoomAt } from "./viewport";

describe("viewport", () => {
  it("round-trips world and screen points", () => {
    const v = { scrollX: 30, scrollY: -10, zoom: 1.5 };
    const [sx, sy] = toScreen(v, 100, 40);
    expect(toWorld(v, sx, sy)).toEqual([100, 40]);
  });

  it("keeps part of a board on screen however far it is panned", () => {
    const area = { left: 0, top: 0, width: 800, height: 600 };
    const box: [number, number, number, number] = [0, 0, 400, 1000];
    const v = { scrollX: 0, scrollY: 0, zoom: 1 };
    expect(keepInView(v, box, area)).toBe(v);
    const left = keepInView({ ...v, scrollX: -5000 }, box, area);
    expect(toScreen(left, 400, 0)[0]).toBeCloseTo(96);
    const down = keepInView({ ...v, scrollY: 5000 }, box, area);
    expect(toScreen(down, 0, 0)[1]).toBeCloseTo(600 - 96);
    const up = keepInView({ ...v, scrollY: -5000, zoom: 2 }, box, area);
    expect(toScreen(up, 0, 1000)[1]).toBeCloseTo(96);
  });

  it("zooms toward the cursor", () => {
    const v = zoomAt(DEFAULT_VIEW, 2, 200, 100);
    expect(toWorld(v, 200, 100)).toEqual([200, 100]);
    expect(v.zoom).toBe(2);
  });

  it("pinches around the fingers' midpoint and pans with it", () => {
    const v = { scrollX: 10, scrollY: -5, zoom: 1 };
    const world = toWorld(v, 200, 100);
    const next = pinchView(v, { x: 200, y: 100, dist: 100 }, { x: 220, y: 90, dist: 200 });
    expect(next.zoom).toBeCloseTo(2);
    const [sx, sy] = toScreen(next, ...world);
    expect(sx).toBeCloseTo(220);
    expect(sy).toBeCloseTo(90);
    expect(pinchView(v, { x: 0, y: 0, dist: 10 }, { x: 0, y: 0, dist: 10_000 }).zoom).toBe(3);
  });

  it("clamps and steps zoom", () => {
    expect(clampZoom(99)).toBe(3);
    expect(clampZoom(0)).toBe(0.1);
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1.04, 1)).toBe(1.1);
    expect(stepZoom(1.04, -1)).toBe(1);
    expect(stepZoom(0.1, -1)).toBe(0.1);
    expect(wheelZoom(1, -100)).toBeGreaterThan(1);
    expect(wheelZoom(1, 100)).toBeLessThan(1);
    // One mouse-wheel notch is about a 10% step, never a jump.
    expect(wheelZoom(1, -100)).toBeLessThanOrEqual(1.11);
    expect(wheelZoom(1, 100)).toBeGreaterThanOrEqual(0.9);
    // A small pinch delta still zooms in proportion.
    expect(wheelZoom(1, -2)).toBeLessThan(wheelZoom(1, -6));
  });

  it("pans in screen pixels at any zoom", () => {
    const v = panBy({ scrollX: 0, scrollY: 0, zoom: 2 }, 20, -10);
    expect(v).toEqual({ scrollX: 10, scrollY: -5, zoom: 2 });
  });

  it("fits a box centred, never past 100%", () => {
    const area = { left: 0, top: 0, width: 1000, height: 600 };
    const small = fitBounds([0, 0, 100, 100], area);
    expect(small.zoom).toBe(1);
    expect(toScreen(small, 50, 50)).toEqual([500, 300]);
    const big = fitBounds([0, 0, 4000, 200], area, 0);
    expect(big.zoom).toBe(0.25);
  });

  it("Fit shows a flow whole while that keeps it readable", () => {
    const area = { left: 300, top: 0, width: 1000, height: 600 };
    const v = fitFlow([0, 0, 1100, 100], area);
    expect(v.zoom).toBeGreaterThanOrEqual(FIT_MIN);
    expect(v).toEqual(fitBounds([0, 0, 1100, 100], area));
  });

  it("eases past FIT_MIN, to no less than FOCUS_MIN, so an anchor fits a narrow strip", () => {
    // About the strip left between the inspector and the Prompt panel on a laptop.
    const area = { left: 320, top: 0, width: 684, height: 600 };
    const box: [number, number, number, number] = [0, 0, 1300, 100];
    const anchor: [number, number, number, number] = [0, 0, 892, 100];
    const v = fitFlow(box, area, anchor);
    expect(v.zoom).toBeLessThan(FIT_MIN);
    expect(v.zoom).toBeGreaterThanOrEqual(FOCUS_MIN);
    expect(toScreen(v, 0, 0)[0]).toBeGreaterThanOrEqual(area.left);
    expect(toScreen(v, 892, 0)[0]).toBeLessThanOrEqual(area.left + area.width);
    // An anchor that won't fit even at FOCUS_MIN keeps FIT_MIN (the card alone is framed then).
    expect(fitFlow(box, area, [0, 0, 1200, 100]).zoom).toBe(FIT_MIN);
  });

  it("Fit stops at FIT_MIN for a long flow: its start, or the anchor, framed without empty board past the ends", () => {
    const area = { left: 300, top: 0, width: 1000, height: 600 };
    const box: [number, number, number, number] = [0, 0, 4000, 100];
    const start = fitFlow(box, area);
    expect(start.zoom).toBe(FIT_MIN);
    expect(toScreen(start, 0, 0)[0]).toBeCloseTo(300 + 32);
    expect(toScreen(start, 0, 50)[1]).toBeCloseTo(300);
    // Anchored on a card in the middle: it sits in the middle of the free area.
    const mid = fitFlow(box, area, [1900, 0, 2100, 100]);
    expect(toScreen(mid, 2000, 0)[0]).toBeCloseTo(800);
    // Anchored on the last card: the flow's end stops at the area's edge, not the middle.
    const end = fitFlow(box, area, [3800, 0, 4000, 100]);
    expect(toScreen(end, 4000, 0)[0]).toBeCloseTo(1300 - 32);
  });

  it("Fit never shrinks a long flow below a readable 80%; it pans from the Goal instead", () => {
    const area = { left: 0, top: 60, width: 1440, height: 760 };
    expect(FIT_MIN).toBe(0.8);
    // Four cards fit a laptop screen whole at 100%.
    expect(fitFlow([0, 0, 1220, 200], area).zoom).toBe(1);
    // Six don't, even at 80%: Fit stays at 80% and starts at the Goal.
    const v = fitFlow([0, 0, 2160, 200], area);
    expect(v.zoom).toBe(FIT_MIN);
    expect(toScreen(v, 0, 0)[0]).toBeCloseTo(32);
  });

  it("pages a long flow sideways, stopping with its end inside the area", () => {
    const area = { left: 0, top: 0, width: 1000, height: 600 };
    const box: [number, number, number, number] = [0, 0, 3000, 100];
    const v0 = { scrollX: 0, scrollY: 0, zoom: 1 };
    const v1 = pageAlong(v0, box, area, 1);
    expect(v1.scrollX).toBeCloseTo(-800);
    const v2 = pageAlong(pageAlong(v1, box, area, 1), box, area, 1);
    // The flow's end stops 48px inside the right edge, and paging further does nothing.
    expect(toScreen(v2, 3000, 0)[0]).toBeCloseTo(952);
    expect(pageAlong(v2, box, area, 1)).toBe(v2);
    // Back to the left: its start stops 48px inside the left edge.
    const back = pageAlong(pageAlong(pageAlong(v2, box, area, -1), box, area, -1), box, area, -1);
    expect(toScreen(back, 0, 0)[0]).toBeCloseTo(48);
  });

  it("scrolls a box into view only when it is outside", () => {
    const area = { left: 0, top: 0, width: 500, height: 500 };
    expect(scrollIntoView(DEFAULT_VIEW, [10, 10, 100, 100], area)).toBe(DEFAULT_VIEW);
    const v = scrollIntoView(DEFAULT_VIEW, [900, 10, 1000, 100], area);
    const [sx] = toScreen(v, 1000, 0);
    expect(sx).toBeLessThanOrEqual(500);
  });

  it("parses stored views defensively", () => {
    expect(parseView({ scrollX: 1, scrollY: 2, zoom: 50 })).toEqual({ scrollX: 1, scrollY: 2, zoom: 3 });
    expect(parseView({ scrollX: "1" })).toBeNull();
    expect(parseView(null)).toBeNull();
  });
});

describe("scene", () => {
  it("lays out every block, the goal and the on-cancel lane", () => {
    const { L, nums } = buildScene(sample().toDict());
    for (const k of ["goal", "on_cancel", "b1", "b2", "b3", "b4", "b5", "b6", "b7"]) expect(L.cards.has(k)).toBe(true);
    expect(L.pars.has("p1")).toBe(true);
    expect(L.loops.has("l1")).toBe(true);
    expect(nums.b1).toBe("1a");
  });

  it("drops into a parallel frame, else onto the nearest gap", () => {
    const { L } = buildScene(sample().toDict());
    const [x0, y0, x1, y1] = L.pars.get("p1")!;
    expect(dropTarget(L, (x0 + x1) / 2, (y0 + y1) / 2)).toEqual({ kind: "branch", par: "p1" });
    const last = L.links[L.links.length - 1]!;
    expect(dropTarget(L, last.cx + 500, -1000)).toEqual({ kind: "link", index: L.links.length - 1 });
  });

  it("bounds cover every card", () => {
    const { L } = buildScene(sample().toDict());
    const [x0, y0, x1, y1] = sceneBounds(L);
    for (const b of L.cards.values()) {
      expect(b[0]).toBeGreaterThanOrEqual(x0);
      expect(b[1]).toBeGreaterThanOrEqual(y0);
      expect(b[2]).toBeLessThanOrEqual(x1);
      expect(b[3]).toBeLessThanOrEqual(y1);
    }
  });

  it("seeds are stable and positive", () => {
    expect(seedOf("b1")).toBe(seedOf("b1"));
    expect(seedOf("b1")).not.toBe(seedOf("b2"));
    expect(seedOf("")).toBeGreaterThan(0);
  });
});

describe("homeView", () => {
  const area = { left: 100, top: 50, width: 800, height: 600 };
  it("centres a flow that fits across the area", () => {
    const v = homeView([0, 0, 400, 100], area);
    const [sx0] = toScreen(v, 0, 0);
    const [sx1] = toScreen(v, 400, 100);
    expect((sx0 + sx1) / 2).toBeCloseTo(500);
  });
  it("opens a short flow at 100%, never enlarged", () => {
    expect(homeView([0, 0, 400, 100], area).zoom).toBe(1);
    expect(homeView([0, 0, 680, 100], area).zoom).toBe(1);
    expect(homeView([0, 0, 4000, 100], area).zoom).toBe(1);
  });
  it("sits a short flow a little above the vertical centre", () => {
    const v = homeView([0, 0, 400, 100], area);
    const mid = (toScreen(v, 0, 0)[1] + toScreen(v, 0, 100)[1]) / 2;
    expect(mid).toBeLessThan(350);
    expect(mid).toBeGreaterThan(300);
  });
  it("starts a long flow at the left edge", () => {
    const v = homeView([0, 0, 4000, 100], area);
    expect(toScreen(v, 0, 0)[0]).toBeCloseTo(132);
  });
});

describe("lerpView", () => {
  const a = { scrollX: 0, scrollY: 0, zoom: 1 };
  const b = { scrollX: 100, scrollY: -50, zoom: 0.25 };
  it("hits both ends exactly", () => {
    expect(lerpView(a, b, 0, 400, 300)).toEqual(a);
    expect(lerpView(a, b, 1, 400, 300)).toEqual(b);
  });
  it("moves zoom geometrically", () => {
    expect(lerpView(a, b, 0.5, 400, 300).zoom).toBeCloseTo(0.5);
  });
  it("moves the world point under the anchor in a straight line", () => {
    const mid = lerpView(a, b, 0.5, 400, 300);
    const [ax, ay] = toWorld(a, 400, 300);
    const [bx, by] = toWorld(b, 400, 300);
    const [mx, my] = toWorld(mid, 400, 300);
    expect(mx).toBeCloseTo((ax + bx) / 2);
    expect(my).toBeCloseTo((ay + by) / 2);
  });
});

describe("easeOutCubic", () => {
  it("is clamped and monotonic", () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});

describe("frameFlow", () => {
  const area = { left: 320, top: 100, width: 680, height: 700 };
  const inArea = (v: { zoom: number; scrollX: number; scrollY: number }, b: [number, number, number, number]) => {
    const [x0, y0] = toScreen(v, b[0], b[1]);
    const [x1, y1] = toScreen(v, b[2], b[3]);
    return x0 >= area.left && x1 <= area.left + area.width && y0 >= area.top && y1 <= area.top + area.height;
  };
  const goal: [number, number, number, number] = [0, 0, 260, 80];
  it("leaves a view that already shows the flow whole", () => {
    const v = { zoom: 0.5, scrollX: 700, scrollY: 400 };
    expect(frameFlow(v, [0, 0, 960, 200], area, { goal })).toBe(v);
  });
  it("pans a flow that fits at this zoom back into view, never zooming", () => {
    const all: [number, number, number, number] = [0, 0, 600, 200];
    const k = frameFlow({ zoom: 1, scrollX: 0, scrollY: 300 }, all, area, { goal });
    expect(k.zoom).toBe(1);
    expect(inArea(k, all)).toBe(true);
  });
  it("without centring, never zooms out to fit a long flow; it reveals the focused block", () => {
    const all: [number, number, number, number] = [0, 0, 1600, 200];
    const box: [number, number, number, number] = [1300, 0, 1560, 80];
    const k = frameFlow({ zoom: 1, scrollX: 0, scrollY: 300 }, all, area, { goal, box });
    expect(k.zoom).toBe(1);
    expect(inArea(k, box)).toBe(true);
  });
  it("brings the Goal along with the focused block when both fit", () => {
    const all: [number, number, number, number] = [0, 0, 1600, 200];
    const box: [number, number, number, number] = [315, 0, 575, 80];
    const k = frameFlow({ zoom: 1, scrollX: -400, scrollY: 300 }, all, area, { goal, box });
    expect(inArea(k, box)).toBe(true);
    expect(inArea(k, goal)).toBe(true);
  });
  it("keeps the Goal in view with nothing to reveal when asked", () => {
    const all: [number, number, number, number] = [0, 0, 1600, 200];
    const k = frameFlow({ zoom: 1, scrollX: -200, scrollY: 300 }, all, area, { goal, keepGoal: true });
    expect(inArea(k, goal)).toBe(true);
  });
});

describe("frameFlow centring", () => {
  it("centres a flow that fits when asked (a panel opened or closed)", () => {
    const area = { left: 0, top: 0, width: 1400, height: 800 };
    const all: [number, number, number, number] = [0, 0, 600, 200];
    const v = frameFlow({ zoom: 1, scrollX: 780, scrollY: 0 }, all, area, { center: true });
    expect(v.scrollX + 300).toBeCloseTo(700);
    // The optical centre: a little above the middle.
    expect(v.scrollY + 100).toBeCloseTo(800 * (0.5 - OPTICAL_RISE));
  });
  it("centres a grown flow with room all round, easing out a little when it no longer fits", () => {
    const area = { left: 320, top: 0, width: 1000, height: 800 };
    const all: [number, number, number, number] = [0, 0, 960, 300];
    const v = frameFlow({ zoom: 1, scrollX: 400, scrollY: 0 }, all, area, { center: true });
    expect(v.zoom).toBeLessThan(1);
    expect(v.zoom).toBeGreaterThanOrEqual(AUTO_ZOOM_MIN);
    const [x0] = toScreen(v, 0, 0);
    const [x1] = toScreen(v, 960, 0);
    expect(x0 - area.left).toBeGreaterThanOrEqual(FRAME_PAD - 1);
    expect(area.left + area.width - x1).toBeGreaterThanOrEqual(FRAME_PAD - 1);
    expect(Math.abs(x0 - area.left - (area.left + area.width - x1))).toBeLessThan(2);
  });
  it("never eases out past AUTO_ZOOM_MIN to keep a long flow whole", () => {
    const area = { left: 0, top: 0, width: 1000, height: 800 };
    const v0 = { zoom: 1, scrollX: 0, scrollY: 0 };
    expect(frameFlow(v0, [0, 0, 3000, 200], area, { center: true }).zoom).toBe(1);
  });
});

describe("chaseView", () => {
  it("keeps the wheel-zoom cursor still on every frame of the chase", () => {
    const a = { scrollX: -40, scrollY: 10, zoom: 1 };
    const b = zoomAt(a, 2, 300, 200);
    expect(fixedPoint(a, b)[0]).toBeCloseTo(300);
    expect(fixedPoint(a, b)[1]).toBeCloseTo(200);
    let v = a;
    for (let i = 0; i < 5; i++) {
      v = chaseView(v, b, 16);
      expect(toWorld(v, 300, 200)[0]).toBeCloseTo(toWorld(a, 300, 200)[0]);
      expect(toWorld(v, 300, 200)[1]).toBeCloseTo(toWorld(a, 300, 200)[1]);
    }
    expect(v.zoom).toBeGreaterThan(1);
    expect(v.zoom).toBeLessThan(2);
  });

  it("moves the same distance at any frame rate and lands exactly on the target", () => {
    const a = { scrollX: 0, scrollY: 0, zoom: 1 };
    const b = panBy(a, 200, -100);
    const fast = chaseView(chaseView(a, b, 8), b, 8);
    const slow = chaseView(a, b, 16);
    expect(fast.scrollX).toBeCloseTo(slow.scrollX);
    expect(slow.scrollX).toBeGreaterThan(0);
    expect(slow.scrollX).toBeLessThan(200);
    let v = a;
    for (let i = 0; i < 100 && v !== b; i++) v = chaseView(v, b, 16);
    expect(v).toBe(b);
    expect(closeView(chaseView(b, b, 16), b)).toBe(true);
  });
});
