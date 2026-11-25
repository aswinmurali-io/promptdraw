// Port of the Python app's test_stage_builder.py: the pure layout helpers of the Stages canvas.
import { describe, expect, it } from "vitest";
import { sample, withFunctions } from "../test/fixtures";
import { CARD_W, FOOT_H, GAP, M, OC_GAP, bodyText, layout, wrap, type Box, type TextLines } from "./layout";
import { Workflow, type Block, type Loop } from "./workflow";

const measure = (text: string) => 7 * Array.from(text).length;
const textLines: TextLines = (text, _mode, width, maxLines) => wrap(text, measure, width, maxLines);
const overlap = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const box = (m: Map<string, Box>, k: string) => m.get(k) as Box;

function noOverlap(boxes: Box[]): void {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i] as Box, boxes[j] as Box), JSON.stringify([boxes[i], boxes[j]])).toBe(false);
  }
}

describe("Wrap", () => {
  it("fits on one line", () => expect(wrap("short text", measure, 200, 2)).toEqual(["short text"]));
  it("wraps and clamps with ellipsis", () => {
    const lines = wrap("one two three four five six seven eight", measure, 70, 2);
    expect(lines.length).toBe(2);
    expect(lines.at(-1)?.endsWith("…")).toBe(true);
    expect(lines.every((l) => measure(l) <= 70)).toBe(true);
  });
  it("breaks long words", () => {
    const lines = wrap("x".repeat(30), measure, 70, 5);
    expect(lines.every((l) => measure(l) <= 70)).toBe(true);
    expect(lines.join("")).toBe("x".repeat(30));
  });
  it("collapses whitespace", () => expect(wrap("a\n\n  b", measure, 200, 2)).toEqual(["a b"]));
});

describe("Layout", () => {
  const setup = () => {
    const wf = sample();
    return { wf, L: layout(wf, 600, textLines) };
  };
  it("every block has a card", () => {
    const { wf, L } = setup();
    expect(new Set(L.cards.keys())).toEqual(new Set(["goal", "on_cancel", ...wf.ids()]));
  });
  it("cards do not overlap", () => noOverlap([...setup().L.cards.values()]));
  it("flows left to right", () => {
    const { wf, L } = setup();
    const lefts = [box(L.cards, "goal")[0], ...wf.chunks(wf.ids(), false).map((g) => box(L.cards, g[0] as string)[0])];
    expect(lefts).toEqual([...lefts].sort((a, b) => a - b));
    expect(new Set(lefts).size).toBe(lefts.length);
  });
  it("single cards sit on one centre line", () => {
    const { L } = setup();
    const mids = new Set(["goal", "b3", "b4", "b5", "b6", "b7"].map((k) => (box(L.cards, k)[1] + box(L.cards, k)[3]) / 2));
    expect(mids.size).toBe(1);
  });
  it("parallel branches stack in a column", () => {
    const { L } = setup();
    const a = box(L.cards, "b1");
    const b = box(L.cards, "b2");
    expect([a[0], a[2]]).toEqual([b[0], b[2]]);
    expect(a[3]).toBeLessThan(b[1]);
    expect(b[3]).toBeLessThan(box(L.tiles, "p1")[1]);
  });
  it("blocks keep block width", () => {
    for (const [k, [x0, , x1]] of setup().L.cards) expect(x1 - x0, k).toBe(CARD_W);
  });
  it("gaps", () => {
    const { wf, L } = setup();
    const top = wf.chunks(wf.ids(), true).length;
    expect(L.links.length).toBe(top + 1 + 1);
    expect(L.links.filter((ln) => ln.loop === "l1").map((ln) => ln.at)).toEqual([wf.idx("b6")]);
    expect(L.links.at(-1)?.at).toBe(wf.blocks.length);
    const xs = L.links.map((ln) => ln.cx);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });
  it("edges fan out and in", () => {
    const { L } = setup();
    expect(L.edges.length).toBe(2 + 2 + 4);
    for (const pts of L.edges) expect(pts[0]).toBeLessThan(pts.at(-2) as number);
    expect(L.backs.length).toBe(1);
  });
  it("loop frame contains its cards and return arrow", () => {
    const { L } = setup();
    const [fx0, fy0, fx1, fy1] = box(L.loops, "l1");
    for (const b of ["b5", "b6"]) {
      const [x0, y0, x1, y1] = box(L.cards, b);
      expect(fx0 < x0 && x1 < fx1 && fy0 < y0 && y1 < fy1).toBe(true);
    }
    const gy = L.backs[0]?.pts[3] as number;
    expect(Math.max(box(L.cards, "b5")[3], box(L.cards, "b6")[3]) < gy && gy < fy1).toBe(true);
  });
  it("tall groups grow the canvas", () => {
    const { wf } = setup();
    wf.addBranch("p1");
    wf.addBranch("p1");
    const L = layout(wf, 100, textLines);
    const [, y0, , y1] = box(L.pars, "p1");
    expect(L.height).toBeGreaterThanOrEqual(y1 + M);
    expect(y0).toBeGreaterThanOrEqual(M);
  });
  it("centred vertically when it fits", () => {
    const { wf } = setup();
    const L = layout(wf, 2000, textLines);
    const g = box(L.cards, "goal");
    const hdr = box(L.cards, "on_cancel");
    expect(Math.abs((g[1] + g[3]) / 2 - (hdr[1] - OC_GAP) / 2)).toBeLessThanOrEqual(20);
  });
  it("loop around parallel clears branch tiles", () => {
    const { wf } = setup();
    (wf.loop("l1") as Loop).blocks = [];
    wf.sync();
    wf.makeLoop(["b1", "b2"]);
    const L = layout(wf, 900, textLines);
    const lid = wf.loops[0]?.id as string;
    const gy = L.backs[0]?.pts[3] as number;
    expect(gy).toBeGreaterThan(box(L.tiles, "p1")[3]);
    expect(gy).toBeLessThan(box(L.loops, lid)[3]);
    expect(box(L.pars, "p1")[1] - box(L.loops, lid)[1]).toBeGreaterThanOrEqual(34);
  });
  it("nested loops", () => {
    const { wf } = setup();
    const lid = wf.makeLoop(["b4", "b5", "b6"]) as string;
    const L = layout(wf, 600, textLines);
    const [ox0, oy0, ox1, oy1] = box(L.loops, lid);
    const [ix0, iy0, ix1, iy1] = box(L.loops, "l1");
    expect(ox0 < ix0 && ix1 < ox1 && oy0 < iy0 && iy1 < oy1).toBe(true);
    expect(iy0 - oy0).toBeGreaterThanOrEqual(44);
    expect(L.backs.length).toBe(2);
    const innerGy = L.backs.filter((bk) => ix0 < (bk.pts[0] as number) && (bk.pts[0] as number) < ix1 && (bk.pts[3] as number) < iy1);
    const outerGy = L.backs.filter((bk) => (bk.pts[3] as number) > iy1);
    expect(innerGy.length).toBe(1);
    expect(outerGy.length).toBe(1);
    expect(outerGy[0]?.pts[3]).toBeLessThan(oy1);
    expect(new Set(L.links.filter((ln) => ln.loop).map((ln) => ln.loop))).toEqual(new Set([lid, "l1"]));
    noOverlap([...L.cards.values()]);
  });
  it("loop arrow clears tall middle unit", () => {
    const { wf } = setup();
    (wf.loop("l1") as Loop).blocks = [];
    wf.sync();
    wf.makeLoop(["b1", "b2", "b3", "b4"]);
    wf.move("b3", -1);
    const L = layout(wf, 600, textLines);
    expect(L.backs[0]?.pts[3]).toBeGreaterThan(box(L.pars, "p1")[3]);
  });
  it("intentions card", () => {
    const { wf } = setup();
    const bid = wf.insert(0, "intentions");
    const b = wf.block(bid) as Block;
    expect(bodyText(b)).toBe("");
    const L = layout(wf, 600, textLines);
    expect(L.lines.get(bid)).toEqual(["Nothing switched on yet"]);
    b.toggles = ["recon", "tests", "pr"];
    expect(bodyText(b)).toBe("Tests matter · Push PR");
  });
  it("empty workflow", () => {
    const L = layout(new Workflow(), 500, textLines);
    expect([...L.cards.keys()]).toEqual(["goal", "on_cancel"]);
    expect(L.links.length).toBe(1);
    expect(L.edges).toEqual([]);
    expect(Math.abs((L.links[0]?.cx as number) - (box(L.cards, "goal")[2] + GAP / 2))).toBeLessThan(1e-9);
  });
});

describe("FunctionShelfTests", () => {
  it("functions sit off the flow", () => {
    const L = layout(withFunctions(), 600, (t) => [Array.from(t).slice(0, 20).join("")]);
    const [fx0, fy0, fx1, fy1] = box(L.cards, "b1");
    expect(L.shelf).not.toBeNull();
    expect(fy1).toBeLessThan(Math.min(...["goal", "b2", "b3", "b4"].map((k) => box(L.cards, k)[1])));
    for (const e of L.edges) {
      for (let i = 0; i < e.length; i += 2) {
        const x = e[i] as number;
        const y = e[i + 1] as number;
        expect(fx0 <= x && x <= fx1 && fy0 <= y && y <= fy1).toBe(false);
      }
    }
    expect(layout(new Workflow({ name: "x" }), 600, (t) => [t]).shelf).toBeNull();
  });
  it("users get footer tab and link", () => {
    const wf = withFunctions();
    const plain = layout(new Workflow({ name: "x", blocks: [{ id: "b2", type: "stage", name: "A", prompt: "x" }] }), 600, () => ["x"]);
    const L = layout(wf, 600, () => ["x"]);
    expect(Object.fromEntries(L.uses)).toEqual({ b2: ["b1"], b3: ["b1"], b4: ["b1"] });
    const card = box(L.cards, "b2");
    const bare = box(plain.cards, "b2");
    expect(card[3] - card[1]).toBe(bare[3] - bare[1] + FOOT_H);
    expect(new Set(L.tabs.keys())).toEqual(new Set(["b2", "b3", "b4"]));
    expect(new Set(L.fnlinks.map((ln) => `${ln.from}>${ln.to}`))).toEqual(new Set(["b2>b1", "b3>b1", "b4>b1"]));
    for (const ln of L.fnlinks) expect(ln.pts.at(-1)).toBe(box(L.cards, "b1")[3] + 1);
  });
});

describe("OnCancelLane", () => {
  const wfN = (n = 3) => {
    const wf = sample();
    for (let i = 0; i < n; i++) wf.addCancelStage(`Stage ${i}`, `do ${i}`);
    return wf;
  };
  it("header sits under the goal below the whole flow", () => {
    const L = layout(wfN(), 600, textLines);
    const hdr = box(L.cards, "on_cancel");
    expect(hdr[0]).toBe(box(L.cards, "goal")[0]);
    for (const [k, b] of L.cards) if (k !== "on_cancel" && !k.startsWith("cancel:")) expect(b[3], k).toBeLessThanOrEqual(hdr[1]);
  });
  it("each stage is its own card in order", () => {
    const L = layout(wfN(3), 600, textLines);
    const keys = ["on_cancel", "cancel:0", "cancel:1", "cancel:2"];
    const xs = keys.map((k) => box(L.cards, k)[0]);
    expect(xs).toEqual([...new Set(xs)].sort((a, b) => a - b));
    expect(new Set(keys.map((k) => Math.round(((box(L.cards, k)[1] + box(L.cards, k)[3]) / 2) * 1000))).size).toBe(1);
    noOverlap([...L.cards.values()]);
    const h = box(L.cards, "on_cancel");
    const s0 = box(L.cards, "cancel:0");
    expect(L.edges).toContainEqual([h[2], (h[1] + h[3]) / 2, s0[0] - 1, (s0[1] + s0[3]) / 2]);
    expect([0, 1, 2].every((i) => (L.lines.get(`cancel:${i}`) ?? []).length > 0)).toBe(true);
  });
  it("empty lane is only the header", () => {
    const L = layout(sample(), 600, textLines);
    expect([...L.cards.keys()].filter((k) => k.startsWith("cancel:"))).toEqual([]);
    expect(L.lines.get("on_cancel")?.length).toBeGreaterThan(0);
  });
  it("canvas covers the lane", () => {
    const L = layout(wfN(6), 300, textLines);
    expect(L.width).toBeGreaterThanOrEqual(Math.max(...[...L.cards.values()].map((b) => b[2])));
    expect(L.height).toBeGreaterThanOrEqual(Math.max(...[...L.cards.values()].map((b) => b[3])));
  });
});
