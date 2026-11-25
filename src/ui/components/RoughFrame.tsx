// Hand-drawn outlines from rough.js. Paths come from the generator (no DOM needed), drawn in
// a fixed viewBox stretched over the parent; non-scaling strokes keep the line weight even.
// A fixed seed keeps the wobble identical between renders.
import rough from "roughjs";
import { useMemo } from "react";

const gen = rough.generator();
const W = 400;
const H = 160;

export interface RoughFrameProps {
  seed: number;
  /** 0 architect, 1 artist, 2 cartoonist. */
  roughness?: number;
  /** Hachure fill (uses currentColor at low opacity via CSS). */
  hachure?: boolean;
  className?: string;
}

export function RoughFrame({ seed, roughness = 1, hachure = false, className }: RoughFrameProps) {
  const paths = useMemo(() => {
    const d = gen.rectangle(3, 3, W - 6, H - 6, {
      seed,
      roughness,
      bowing: 0.8,
      stroke: "currentColor",
      strokeWidth: 1.3,
      fill: hachure ? "currentColor" : undefined,
      fillStyle: "hachure",
      hachureGap: 9,
      hachureAngle: -41,
      fillWeight: 0.6,
    });
    return gen.toPaths(d);
  }, [seed, roughness, hachure]);
  return (
    <svg className={"rough-frame " + (className ?? "")} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill="none"
          stroke="currentColor"
          strokeWidth={p.strokeWidth}
          vectorEffect="non-scaling-stroke"
          className={p.strokeWidth < 1 ? "rough-hachure" : undefined}
        />
      ))}
    </svg>
  );
}

/** A loose hand-drawn arrow along a curve (welcome hints). Points are in viewBox units. */
export function RoughArrow({ points, seed, width, height, className }: { points: [number, number][]; seed: number; width: number; height: number; className?: string }) {
  const paths = useMemo(() => {
    const curve = gen.curve(points, { seed, roughness: 1.2, stroke: "currentColor", strokeWidth: 1.5 });
    const [x2, y2] = points[points.length - 1] as [number, number];
    const [x1, y1] = points[points.length - 2] as [number, number];
    const a = Math.atan2(y2 - y1, x2 - x1);
    const len = 11;
    const head = (da: number): [number, number] => [x2 - len * Math.cos(a + da), y2 - len * Math.sin(a + da)];
    const tip = gen.linearPath([head(0.45), [x2, y2], head(-0.45)], { seed: seed + 1, roughness: 0.8, stroke: "currentColor", strokeWidth: 1.5 });
    return [...gen.toPaths(curve), ...gen.toPaths(tip)];
  }, [points, seed]);
  return (
    <svg className={className} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      {paths.map((p, i) => (
        <path key={i} d={p.d} pathLength={1} fill="none" stroke="currentColor" strokeWidth={p.strokeWidth} strokeLinecap="round" />
      ))}
    </svg>
  );
}
