// The Simple task board's motion. The board is redrawn from scratch on every change, so this
// compares each drawing with the last: new cards grow in (40 ms apart), removed ones shrink away
// (an inert copy of the old card), cards that stay glide to their new place and frames follow.
// An arrow keeps its wobble (it is keyed by its two ends); one whose path is unchanged stays
// still, and a new or re-routed one is hidden until the cards have landed, then draws along its
// path, so no arrow ever points at where a card was. Only a change to what is on the board
// (cards or locks) animates; typing in the Task node, resizing it or a reload draws in place.
// @lat: [[ui#Canvas#Parallel option lanes]]
import { useLayoutEffect, useRef, type RefObject } from "react";
import type { Box } from "../../core";
import type { Scene } from "../stages/scene";
import { DUR, EASE_IN, EASE_OUT, EXIT, motionOK, settled } from "./motion";

const STAGGER = 40;

interface Snap {
  sig: string;
  boxes: Map<string, Box>;
  copies: Map<string, Element>;
  /** Arrow key -> its path, and the loops' return arrows by index. */
  edges: Map<string, string>;
}

function frames(scene: Scene): Map<string, Box> {
  return new Map<string, Box>([...scene.L.pars, ...scene.L.loops]);
}

export function useBoardMotion(svgRef: RefObject<SVGSVGElement | null>, scene: Scene): void {
  const last = useRef<Snap | null>(null);
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const { L, board } = scene;
    const cards = new Map(L.cards);
    const boxes = new Map<string, Box>([...cards, ...frames(scene)]);
    const sig = [...cards.keys()].join(",") + "|" + [...(board?.locked ?? [])].join(",");
    const edges = new Map<string, string>();
    L.edges.forEach((pts, i) => edges.set(board?.edgeKeys?.get(pts) ?? `e${i}`, pts.map(Math.round).join(",")));
    L.backs.forEach((bk, i) => edges.set(`back${i}`, bk.pts.map(Math.round).join(",")));
    const prev = last.current;
    const el = (sel: string, key: string) => svg.querySelector<SVGGElement>(`${sel}[data-key="${CSS.escape(key)}"]`);
    const snapshot = () => {
      const copies = new Map<string, Element>();
      svg.querySelectorAll<SVGGElement>(".sk-card[data-key]").forEach((g) => copies.set(g.dataset.key ?? "", g.cloneNode(true) as Element));
      last.current = { sig, boxes, copies, edges };
    };
    if (!prev || prev.sig === sig || !motionOK() || !settled()) {
      snapshot();
      return;
    }
    const scene0 = svg.querySelector(".sk-scene") ?? svg;
    const fill = { transformBox: "fill-box", transformOrigin: "center" } as const;

    // Removed cards shrink away where they stood.
    for (const [k, copy] of prev.copies) {
      if (cards.has(k)) continue;
      const g = copy.cloneNode(true) as SVGGElement;
      g.setAttribute("aria-hidden", "true");
      g.removeAttribute("data-hit");
      g.querySelectorAll("[data-hit]").forEach((n) => n.removeAttribute("data-hit"));
      Object.assign(g.style, fill, { pointerEvents: "none" });
      scene0.appendChild(g);
      const a = g.animate(
        [
          { opacity: 1, transform: "scale(1)" },
          { opacity: 0, transform: "scale(0.96)" },
        ],
        { duration: EXIT[2], easing: EASE_IN, fill: "forwards" },
      );
      const done = () => g.remove();
      a.finished.then(done, done);
    }

    // New cards grow in, in reading order; the rest glide from where they were.
    let n = 0;
    let moved = false;
    for (const [k, [x0, y0]] of cards) {
      const g = el(".sk-card", k);
      if (!g) continue;
      Object.assign(g.style, fill);
      const was = prev.boxes.get(k);
      if (!was) {
        g.animate(
          [
            { opacity: 0, transform: "scale(0.96)" },
            { opacity: 1, transform: "scale(1)" },
          ],
          { duration: DUR[2], delay: STAGGER * n++, easing: EASE_OUT, fill: "backwards" },
        );
      } else if (was[0] !== x0 || was[1] !== y0) {
        moved = true;
        g.animate([{ transform: `translate(${was[0] - x0}px, ${was[1] - y0}px)` }, { transform: "none" }], { duration: DUR[3], easing: EASE_OUT });
      }
    }

    // Frames and their pills follow their cards; a new frame (an agentic loop, the recon group)
    // fades in once its cards have started.
    for (const [k, [x0, y0]] of frames(scene)) {
      const was = prev.boxes.get(k);
      const gs = [el(".sk-frame", k), el(".sk-par-pill", k)].filter((g): g is SVGGElement => !!g);
      for (const g of gs) {
        if (!was) g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR[3], delay: STAGGER, easing: EASE_OUT, fill: "backwards" });
        else if (was[0] !== x0 || was[1] !== y0) g.animate([{ transform: `translate(${was[0] - x0}px, ${was[1] - y0}px)` }, { transform: "none" }], { duration: DUR[3], easing: EASE_OUT });
      }
    }

    // Arrows: an unchanged one stays put; a new or re-routed one waits for the cards to land.
    const wait = moved ? DUR[3] : DUR[1];
    const arrows: [SVGGElement, string][] = [];
    svg.querySelectorAll<SVGGElement>(".sk-edge").forEach((g, i) => arrows.push([g, g.dataset.edge ?? `e${i}`]));
    svg.querySelectorAll<SVGGElement>(".sk-back").forEach((g, i) => arrows.push([g, `back${i}`]));
    for (const [g, k] of arrows) {
      if (prev.edges.get(k) === edges.get(k)) continue;
      g.querySelectorAll("path").forEach((p) => {
        // A dashed stroke (a locked arrow, a loop's return) keeps its dashes and fades in instead.
        if (p.getAttribute("stroke-dasharray")) {
          p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR[2], delay: wait, easing: EASE_OUT, fill: "backwards" });
          return;
        }
        // Drawn as a unit length for the sweep, then given back its own length.
        p.setAttribute("pathLength", "1");
        const a = p.animate([{ strokeDasharray: "0 1" }, { strokeDasharray: "1 0" }], { duration: DUR[2], delay: wait, easing: EASE_OUT, fill: "backwards" });
        const done = () => p.removeAttribute("pathLength");
        a.finished.then(done, done);
      });
    }
    snapshot();
  });
}
