// Draws a laid-out workflow as a hand-drawn sketch: The Python app StageBuilder.redraw / _card /
// _uses_footer / _pill rebuilt with rough.js paths in SVG. Every hit target carries
// data-hit / data-key attributes that the canvas reads for clicks, drags and menus.
import { memo, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  FOOT_H,
  HEAD_H,
  HEAD_R,
  LINE_H,
  LOOP_HEAD,
  NAME_H,
  PAD,
  SHELF_HEAD,
  STAGE_MODELS,
  TAB_R,
  TEMPLATES,
  TEXT_X,
  bodyText,
  hasKey,
  oneOf,
  summary,
  wrap,
  type Block,
} from "../../core";
import type { StageSelection } from "./edits";
import { FONTS, cardLines, measure, seedOf, type Scene } from "./scene";
import { INK, hatch, roughArrow, roughCircle, roughLine, roughRect, type SketchPath } from "./sketch";

export function Paths({ paths, className }: { paths: SketchPath[]; className?: string }) {
  return (
    <>
      {paths.map((p, i) => (
        <path
          key={i}
          className={className}
          d={p.d}
          fill={p.fill}
          stroke={p.stroke}
          strokeWidth={p.width}
          strokeDasharray={p.dash}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </>
  );
}

function T({ x, y, font, fill, children, anchor = "start", baseline = "hanging", className }: { x: number; y: number; font: keyof typeof FONTS; fill: string; children: ReactNode; anchor?: "start" | "middle" | "end"; baseline?: "hanging" | "central"; className?: string }) {
  return (
    <text x={x} y={y} fill={fill} textAnchor={anchor} dominantBaseline={baseline} className={className} style={{ font: FONTS[font] }}>
      {children}
    </text>
  );
}

/** Width of a card's "Group" pill: box, gap, word and padding. */
const GROUP_W = 7 + 12 + 5 + 34 + 8;

function Pill({ x, y, text, fg, border, anchor, seed }: { x: number; y: number; text: string; fg: string; border: string; anchor: "w" | "center"; seed: number }) {
  const w = measure("pill", text) + 18;
  const h = 20;
  const x0 = anchor === "center" ? x - w / 2 : x;
  return (
    <g className="sk-pill">
      <path d={`M${x0 + 10} ${y - h / 2}h${w - 20}a10 10 0 0 1 0 ${h}h${-(w - 20)}a10 10 0 0 1 0 ${-h}z`} fill={INK.surface} />
      <Paths paths={roughRect(x0, y - h / 2, x0 + w, y + h / 2, 10, { stroke: border, width: 1.2, seed, roughness: 0.7 })} />
      <T x={x0 + w / 2} y={y} font="pill" fill={fg} anchor="middle" baseline="central">
        {text}
      </T>
    </g>
  );
}

export interface SceneViewProps {
  scene: Scene;
  selection: StageSelection;
}

/** The static layer: redrawn only when the workflow or the selection changes. */
export const SceneView = memo(function SceneView({ scene, selection }: SceneViewProps) {
  const { wf, L, nums, board } = scene;
  const focus = selection.focus;
  const sel = new Set(selection.sel);
  const hot = focus?.kind === "block" ? focus.id : null;

  const loops = [...L.loops.entries()].sort((a, b) => a[1][0] - a[1][2] - (b[1][0] - b[1][2]));
  const fnlinks = [...L.fnlinks].sort((a, b) => Number(hot !== null && [a.from, a.to].includes(hot)) - Number(hot !== null && [b.from, b.to].includes(hot)));
  const cancelEdges = new Set(L.cancelEdges);
  // A/B forks: a frame round the lanes. A lane's empty room is a hit target that switches to that variant; the
  // tags (the flag pill on top, each lane's tag above its card) are drawn by the tags layer above the canvas.
  const forkFrames = [...L.forks.entries()].map(([fid, [x0, y0, x1, y1]]) => (
    <g key={fid} className="sk-fork" data-key={fid}>
      <Paths paths={roughRect(x0, y0, x1, y1, 10, { stroke: INK.ab, fill: INK.abSoft, width: 1.4, dash: [7, 4], seed: seedOf(fid), roughness: 0.8 })} />
      {(L.forkInfo.get(fid)?.blocks ?? []).map((bid) => {
        const c = L.cards.get(bid);
        return c ? (
          <rect key={bid} className="sk-lane" data-hit="variant" data-key={bid} x={c[0] - 8} y={y0 + 6} width={c[2] - c[0] + 16} height={y1 - y0 - 12} rx={8} fill="transparent" />
        ) : null;
      })}
    </g>
  ));
  // Parallel frames: on Stages a loop holds them, so they paint over it; on the Simple task
  // board the main parallel group holds the loops, so it paints first.
  const parFrames = (
    <>
      {[...L.pars.entries()].map(([pid, [x0, y0, x1, y1]]) => {
        const on = focus?.kind === "par" && focus.id === pid;
        return (
          <g key={pid} data-hit="par" data-key={pid} className="sk-frame" data-focused={on || undefined} data-locked={board?.dimFrames.has(pid) || undefined}>
            <Paths paths={roughRect(x0, y0, x1, y1, 10, { stroke: INK.code, fill: INK.codeSoft, width: on ? 2.5 : 1.2, seed: seedOf(pid), roughness: 0.8 })} />
          </g>
        );
      })}

    </>
  );

  return (
    <g className="sk-scene">
      {board && parFrames}
      {loops.map(([lid, [x0, y0, x1, y1]]) => {
        const lp = wf.loop(lid);
        if (!lp) return null;
        const on = focus?.kind === "loop" && focus.id === lid;
        const cy = y0 + LOOP_HEAD / 2;
        const label = lp.agentic ? "AGENTIC LOOP" : "LOOP";
        const lx = x0 + 14;
        const px = lx + measure("name", "↻") + 6 + measure("kind", label) + 12;
        const room = x1 - 14 - px - 18;
        let text = board?.loopText?.[lid] ?? wf.loopSummary(lp);
        if (measure("pill", text) > room) text = text.split(" · ")[0] as string;
        text = wrap(text, (t) => measure("pill", t), Math.max(room, 30), 1)[0] as string;
        return (
          <g key={lid} data-hit="loop" data-key={lid} className="sk-frame" data-focused={on || undefined}>
            <Paths
              paths={roughRect(x0, y0, x1, y1, 10, { stroke: INK.accent, fill: INK.accentSoft, width: on ? 2.5 : 1.5, dash: on ? undefined : [6, 4], seed: seedOf(lid), roughness: 0.8 })}
            />
            <T x={lx} y={cy} font="name" fill={INK.accent} baseline="central">
              ↻
            </T>
            <T x={lx + measure("name", "↻") + 6} y={cy} font="kind" fill={INK.muted} baseline="central">
              {label}
            </T>
            <Pill x={px} y={cy} text={text} fg={lp.agentic ? INK.accent : INK.muted} border={lp.agentic ? INK.accent : INK.edge} anchor="w" seed={seedOf(lid + "pill")} />
          </g>
        );
      })}

      {!board && parFrames}
      {!board && forkFrames}

      {L.shelf && (
        <g className="sk-shelf">
          <Paths paths={roughRect(...L.shelf, 10, { stroke: INK.fn, fill: INK.surface, width: 1.2, dash: [6, 4], seed: 77, roughness: 0.8 })} />
          <T x={L.shelf[0] + 14} y={L.shelf[1] + SHELF_HEAD / 2} font="kind" fill={INK.fn} baseline="central">
            {shelfTitle(L.shelf[2] - L.shelf[0] - 28)}
          </T>
        </g>
      )}

      {fnlinks.map((ln, i) => {
        const on = hot !== null && (ln.from === hot || ln.to === hot);
        return (
          <polyline
            key={`fl${i}`}
            className="sk-fnlink"
            points={ln.pts.join(" ")}
            fill="none"
            stroke={on ? INK.fn : INK.fnLine}
            strokeWidth={on ? 2 : 1.2}
            strokeDasharray={on ? undefined : "2 4"}
            strokeLinecap="round"
          />
        );
      })}

      {L.edges.map((pts, i) => {
        const dim = board?.dimEdges.has(pts);
        // On the board an arrow is keyed by its two ends, so it keeps its wobble as others come and go.
        const ek = board?.edgeKeys?.get(pts);
        const style = { stroke: cancelEdges.has(pts) ? INK.cancel : INK.muted, width: 1.5, seed: ek ? seedOf(ek) : 500 + i, roughness: 0.6, ...(dim ? { dash: [5, 5] } : {}) };
        return (
          <g key={ek ?? `e${i}`} className="sk-edge" data-edge={ek} data-locked={dim || undefined}>
            <Paths paths={board?.headless.has(pts) ? roughLine(pts, style) : roughArrow(pts, style)} />
          </g>
        );
      })}

      {[...L.pars.entries()].map(([pid, [x0, y0, x1]]) => {
        const join = wf.par(pid)?.join === "first" ? "first to finish" : "wait for all";
        return (
          <g key={`pp${pid}`} data-hit="par" data-key={pid} className="sk-par-pill" data-locked={board?.dimFrames.has(pid) || undefined}>
            <Pill x={(x0 + x1) / 2} y={y0} text={"⇉ parallel · " + join} fg={INK.code} border={INK.code} anchor="center" seed={seedOf(pid + "pill")} />
          </g>
        );
      })}

      {[...L.cards.keys()].map((key) => (
        <Card key={key} k={key} scene={scene} focused={isFocused(key, selection)} selected={sel.has(key)} nums={nums} />
      ))}


      {L.links.map((ln, i) => {
        // With no blocks yet the one + after the Goal is the next step: larger, in the accent.
        const next = !wf.ids().length;
        const r = next ? 14 : 11;
        return (
          <g key={`plus${i}`} data-hit="plus" data-key={String(i)} className="sk-plus" data-next={next || undefined}>
            <circle cx={ln.cx} cy={ln.cy} r={r} fill={next ? INK.accentSoft : INK.surface} />
            <Paths paths={roughCircle(ln.cx, ln.cy, r * 2, { stroke: next ? INK.accent : INK.edge, width: next ? 1.8 : 1.2, seed: 900 + i, roughness: 0.7 })} />
            <T x={ln.cx} y={ln.cy + 0.5} font="name" fill={next ? INK.accent : INK.muted} anchor="middle" baseline="central">
              +
            </T>
            <title>{next ? "Add the first stage" : "Add a block here"}</title>
          </g>
        );
      })}

      {[...L.tiles.entries()].map(([pid, [x0, y0, x1, y1]]) => (
        <g key={`t${pid}`} data-hit="branch" data-key={pid} className="sk-tile">
          <Paths paths={roughRect(x0, y0, x1, y1, 7, { stroke: INK.edge, fill: INK.surface, width: 1.2, dash: [4, 3], seed: seedOf(pid + "tile"), roughness: 0.7 })} />
          <T x={(x0 + x1) / 2} y={(y0 + y1) / 2} font="pill" fill={INK.muted} anchor="middle" baseline="central">
            + branch
          </T>
        </g>
      ))}

      {L.backs.map((bk, i) => (
        <g key={`bk${i}`} className="sk-back">
          <Paths paths={roughArrow(bk.pts, { stroke: INK.accent, width: 1.8, dash: [5, 4], seed: 700 + i, roughness: 0.6 })} />
          <circle cx={bk.badge[0]} cy={bk.badge[1]} r={10} fill={INK.surface} />
          <Paths paths={roughCircle(bk.badge[0], bk.badge[1], 20, { stroke: INK.accent, width: 1.4, seed: 800 + i, roughness: 0.6 })} />
          <T x={bk.badge[0]} y={bk.badge[1]} font="pill" fill={INK.accent} anchor="middle" baseline="central">
            ↺
          </T>
        </g>
      ))}
    </g>
  );
});

function isFocused(key: string, s: StageSelection): boolean {
  const f = s.focus;
  if (!f) return false;
  if (key === "goal") return f.kind === "goal";
  if (key === "on_cancel") return f.kind === "oncancel";
  if (key.startsWith("cancel:")) return f.kind === "cancel" && f.i === Number(key.slice(7));
  return f.kind === "block" && f.id === key;
}

interface CardProps {
  k: string;
  scene: Scene;
  focused: boolean;
  selected: boolean;
  nums: Record<string, string>;
}

/** One card (`_card`): halo, outline, header label and tags, name, body, uses footer, controls. */
function Card({ k: key, scene, focused, selected, nums }: CardProps) {
  const { wf, L, board } = scene;
  const [x0, y0, x1, y1] = L.cards.get(key) as [number, number, number, number];
  const locked = !!board?.locked.has(key);
  const oc = key === "on_cancel";
  const cs = key.startsWith("cancel:");
  const goal = key === "goal" || oc;
  const ci = cs ? Number(key.slice(7)) : -1;
  let b: Block | null = null;
  if (cs) {
    const st = wf.on_cancel.stages[ci];
    b = { id: key, type: "stage", name: st?.name ?? "", prompt: st?.prompt ?? "" };
    if (oneOf(STAGE_MODELS, st?.model)) b.model = st?.model;
  } else if (!goal) b = wf.block(key);
  if (!goal && !b) return null;
  const kind = oc ? "oncancel" : goal ? "goal" : (b as Block).type;
  const seed = seedOf(key);
  const variant = !board && b && !cs ? scene.variants?.get(key) : undefined;
  const inline = !board && b && !cs ? scene.inline?.get(key) : undefined;
  const flagMode = scene.flagMode ?? "embed";
  const out: ReactNode[] = [];

  if (selected || focused) {
    // One accent treatment for focus and selection; the tick box tells them apart.
    let halo: string = INK.accentSoft;
    if (oc || cs) halo = INK.cancelLine;
    out.push(<path key="halo" className={oc || cs ? "sk-cancel-halo" : undefined} d={rr(x0 - 5, y0 - 5, x1 + 5, y1 + 5, 11)} fill={halo} />);
  }
  let fill: string = { oncancel: INK.cancelSoft, goal: INK.accentSoft, stage: INK.surface, prompt: INK.codeSoft, intentions: INK.surface, function: INK.fnSoft }[kind] ?? INK.surface;
  let outline: string = focused || selected
    ? INK.accent
    : goal || cs || kind === "intentions"
        ? INK.accent
        : kind === "function"
          ? INK.fn
          : kind === "prompt"
            ? INK.code
            : INK.edge;
  if (oc || cs) {
    fill = INK.cancelSoft;
    outline = INK.cancel;
  }
  const quiet = !(focused || selected);
  const dash = locked ? [6, 5] : quiet ? ({ prompt: [4, 3], intentions: [2, 3], oncancel: [6, 4] } as Record<string, number[]>)[kind] : undefined;
  // Read-only stages (and, on the Simple task board, read-only function blocks such as the recon
  // workers) wear the hatch and the eye; a stage's outline turns blue, a function keeps its own.
  const readOnly = (kind === "stage" || kind === "function") && !!b?.read_only;
  if (readOnly && quiet && kind === "stage") outline = INK.code;
  const width = focused || selected ? 2 : kind === "function" ? 2.2 : 1.5;
  out.push(<path key="fill" className={oc || cs ? "sk-cancel-fill" : undefined} d={rr(x0, y0, x1, y1, 7)} fill={fill} />);
  if (readOnly) out.push(<Paths key="hatch" paths={hatch(x0 + 4, y0 + 4, x1 - 4, y1 - 4, 5, { fill: kind === "function" ? "#f6d9f9" : INK.codeSoft, seed: seed + 3, roughness: 0.5 })} />);
  out.push(<Paths key="outline" paths={roughRect(x0, y0, x1, y1, 7, { stroke: outline, width, dash, seed, roughness: 0.9 })} />);

  const tx = x0 + TEXT_X;
  const tw = x1 - x0 - 2 * TEXT_X;
  let y = y0 + PAD;
  // Stage, prompt, function and intentions cards can be ticked; their tick joins the grip and ×
  // at the top right, so every header starts on the text's edge.
  const tickable = !goal && !cs && !board;
  let hx = tx;
  let label: string;
  let color: string;
  if (oc) {
    const n = wf.on_cancel.stages.length;
    [label, color] = [`ON CANCEL · ${n} STAGE${n === 1 ? "" : "S"}`, INK.cancel];
  } else if (goal) [label, color] = ["GOAL", INK.accent];
  else if (cs) [label, color] = [`CANCEL ${ci + 1}`, INK.cancel];
  else if (kind === "stage") [label, color] = ["STAGE " + (nums[key] ?? "").toUpperCase(), INK.muted];
  else if (kind === "intentions") [label, color] = [`INTENTIONS · ${summary(b as Block).length} ON`, INK.accent];
  else if (kind === "function") {
    out.push(<circle key="fb" cx={hx + 8} cy={y + 9} r={9} fill={INK.fn} />);
    out.push(
      <T key="fbt" x={hx + 8} y={y + 9.5} font="name" fill={INK.fnSoft} anchor="middle" baseline="central">
        ƒ
      </T>,
    );
    hx += 24;
    [label, color] = ["FUNCTION", INK.fn];
  } else [label, color] = ["PROMPT", INK.code];
  if (board?.eyebrows[key]) label = board.eyebrows[key] as string;
  if (locked) {
    // A padlock before the eyebrow: this option does not run.
    out.push(<rect key="lockb" x={hx + 2} y={y + 7} width={11} height={9} rx={2} fill={INK.muted} />);
    out.push(<path key="locks" d={`M${hx + 4.5} ${y + 7}v-2.5a3 3 0 0 1 6 0v2.5`} fill="none" stroke={INK.muted} strokeWidth={1.6} />);
    hx += 19;
  }
  if (readOnly) {
    out.push(<ellipse key="eye" cx={hx + 8} cy={y + 9} rx={8} ry={5} fill="none" stroke={INK.code} strokeWidth={1.6} />);
    out.push(<circle key="pupil" cx={hx + 8} cy={y + 9} r={2.5} fill={INK.code} />);
    hx += 22;
  }
  out.push(
    <T key="label" x={hx} y={y + 3} font="kind" fill={color} className="sk-kind">
      {label}
    </T>,
  );
  const model = b && oneOf(STAGE_MODELS, b.model) ? b.model : null;
  const tpl = b && hasKey(TEMPLATES, b.template) ? TEMPLATES[b.template].name.toLowerCase() + " template" : null;
  const tagX = hx + measure("kind", label) + 8;
  for (const tag of [[model, tpl].filter(Boolean).join(" · "), model]) {
    if (tag && tagX + measure("tag", tag) <= x1 - (tickable ? GROUP_W + 40 : HEAD_R)) {
      out.push(
        <T key="tag" x={tagX} y={y + 3} font="tag" fill={INK.accent}>
          {tag}
        </T>,
      );
      break;
    }
  }
  y += HEAD_H;
  if (variant && !variant.selected && flagMode === "strip") {
    // Strip drops this block from the prompt: a stroke through the card says so.
    out.push(<path key="strip" className="sk-strike" d={`M${x0 + 8} ${y1 - 8}L${x1 - 8} ${y0 + 8}`} fill="none" stroke={INK.ab} strokeWidth={1.4} strokeDasharray="6 5" strokeLinecap="round" />);
  }
  if (kind === "stage" && b) {
    const name = wrap(b.name || "Untitled stage", (t) => measure("name", t), tw, 1)[0];
    out.push(
      <T key="name" x={tx} y={y} font="name" fill={b.name ? INK.text : INK.muted}>
        {name}
      </T>,
    );
    y += NAME_H;
  } else if (kind === "function" && b) {
    const params = Array.isArray(b.params) ? (b.params as string[]) : [];
    const sig = String(b.name || "Unnamed") + (params.length ? "  ·  needs " + params.join(", ") : "");
    out.push(
      <T key="name" x={tx} y={y + 1} font="mono" fill={INK.fn}>
        {wrap(sig, (t) => measure("mono", t), tw, 1)[0]}
      </T>,
    );
    y += NAME_H;
  }
  const empty = oc ? !wf.on_cancel.stages.length : goal ? !wf.goal.trim() : !bodyText(b as Block);
  const bodyFont = key === "goal" ? "goal" : kind === "prompt" || kind === "function" ? "mono" : "body";
  const bodyColor = empty || kind === "stage" ? INK.muted : INK.text;
  if (key === "goal" && empty) {
    // The flow's first job, drawn as an accent call to action rather than a faint line.
    const text = board?.goalCta ?? "✎  Describe the goal";
    const w = measure("pill", text) * (13 / 12) + 24;
    out.push(
      <g key="goalcta" className="sk-goal-cta">
        <path d={rr(tx - 2, y - 3, tx - 2 + w, y + 21, 12)} fill={INK.accent} />
        <text x={tx - 2 + w / 2} y={y + 9.5} fill={INK.surface} textAnchor="middle" dominantBaseline="central" style={{ font: '700 13px "Assistant", system-ui, sans-serif' }}>
          {text}
        </text>
      </g>,
    );
  } else cardLines(L, key, empty).forEach((line, i) => {
    out.push(
      <T key={`l${i}`} x={tx} y={y + 1} font={bodyFont} fill={bodyColor} className={empty ? "sk-empty" : undefined}>
        {line}
      </T>,
    );
    y += LINE_H;
  });

  const used = L.uses.get(key);
  if (used) {
    const fy = y1 - FOOT_H + 4;
    const cy = fy + (FOOT_H - 4) / 2;
    out.push(<line key="fl" x1={x0 + 8} y1={fy} x2={x1 - 8} y2={fy} stroke={INK.fn} strokeDasharray="3 3" />);
    out.push(
      <T key="uses" x={tx} y={cy} font="tag" fill={INK.muted} baseline="central">
        Uses
      </T>,
    );
    let ux = tx + measure("tag", "Uses") + 8;
    for (let i = 0; i < used.length; i++) {
      const fb = wf.block(used[i] as string);
      const text = "ƒ " + String(fb?.name || "Unnamed");
      const w = measure("tag", text) + 14;
      if (ux + w > x1 - 10) {
        out.push(
          <T key="more" x={ux} y={cy} font="tag" fill={INK.fn} baseline="central">
            +{used.length - i}
          </T>,
        );
        break;
      }
      out.push(<path key={`up${i}`} d={rr(ux, cy - 9, ux + w, cy + 9, 9)} fill={INK.fnSoft} stroke={INK.fn} strokeWidth={1} />);
      out.push(
        <T key={`ut${i}`} x={ux + 7} y={cy} font="tag" fill={INK.fn} baseline="central">
          {text}
        </T>,
      );
      ux += w + 6;
    }
    const tab = L.tabs.get(key);
    if (tab) {
      out.push(<circle key="tab" cx={tab[0]} cy={tab[1]} r={TAB_R} fill={INK.fn} stroke={INK.surface} strokeWidth={2} />);
      out.push(
        <T key="tabt" x={tab[0]} y={tab[1] + 0.5} font="tag" fill={INK.fnSoft} anchor="middle" baseline="central">
          ƒ
        </T>,
      );
    }
  }

  const controls: ReactNode[] = [];
  if (oc && !wf.on_cancel.stages.length) {
    // A direct way in: the empty lane adds its first stage from the card itself.
    // The UI face, like the card's eyebrow beside it: this is a control, not code.
    const text = "+ Add stage";
    const w = measure("pill", text) + 18;
    const bx = x1 - PAD - w;
    const by = y0 + PAD - 2;
    controls.push(
      <g key="addc" data-hit="addcancel" data-key={key} className="sk-addcancel">
        <title>Add a cancel stage</title>
        <path d={rr(bx, by, bx + w, by + 20, 10)} fill={INK.surface} stroke={INK.cancel} strokeWidth={1.2} />
        <T x={bx + w / 2} y={by + 10.5} font="pill" fill={INK.cancel} anchor="middle" baseline="central">
          {text}
        </T>
      </g>,
    );
  }
  // Inline controls on the eyebrow row, shown on hover or focus: a "Group" pill (its box ticks
  // the card for Loop / Parallel) and delete. Each has a 24px hit area with a soft chip on hover,
  // a stroke dark enough to read on the card, and a tooltip naming what it does. There is no
  // grip: a press anywhere on the card drags it.
  const cy = y0 + PAD + 6;
  const noun = goal ? "goal" : oc ? "cancel lane" : cs ? "cancel stage" : kind === "stage" ? "stage" : kind === "intentions" ? "intentions block" : kind === "function" ? "function" : "prompt block";
  if ((cs || !goal) && (!board || board.removable.has(key))) {
    controls.push(
      <g key="del" data-hit="del" data-key={key} className="sk-del">
        <title>{board ? "Untick this option" : `Delete ${noun}`}</title>
        <rect className="sk-ctl-bg" x={x1 - 28} y={cy - 12} width={24} height={24} rx={6} />
        <path d={`M${x1 - 20} ${cy - 4}l8 8M${x1 - 12} ${cy - 4}l-8 8`} fill="none" stroke={INK.muted} strokeWidth={1.8} strokeLinecap="round" />
      </g>,
    );
  }
  if (tickable) {
    const w = GROUP_W;
    const px = x1 - 32 - w;
    const bx = px + 7;
    const by = cy - 6;
    controls.push(
      <g key="tick" data-hit="tick" data-key={key} className="sk-tick" role="checkbox" aria-checked={selected} aria-label={`Select ${label.toLowerCase()} to group`}>
        <title>Tick to group with other blocks: Loop (L) or Parallel (G)</title>
        <rect className="sk-ctl-bg sk-tick-bg" x={px} y={cy - 12} width={w} height={24} rx={12} />
        <Paths paths={roughRect(bx, by, bx + 12, by + 12, 2, { stroke: selected ? INK.accent : INK.muted, fill: selected ? INK.accent : INK.surface, width: 1.5, seed: seed + 9, roughness: 0.5 })} />
        {selected && <polyline points={`${bx + 2.5},${by + 6.5} ${bx + 5},${by + 9} ${bx + 9.5},${by + 3}`} fill="none" stroke={INK.surface} strokeWidth={2} strokeLinecap="round" />}
        <T x={bx + 17} y={cy + 0.5} font="pill" fill={selected ? INK.accent : INK.muted} baseline="central">
          Group
        </T>
      </g>,
    );
  }

  return (
    <g data-hit="node" data-key={key} className={`sk-card sk-card--${kind}`} data-focused={focused || undefined} data-selected={selected || undefined} data-locked={locked || undefined} data-variant={variant ? (variant.selected ? "on" : "off") : undefined} data-inline={inline ? inline.letter ?? "mixed" : undefined} data-flag-mode={variant || inline ? flagMode : undefined}>
      {out}
      {controls}
    </g>
  );
}

/** The function shelf's heading, as much of the explanation as fits inside the frame. */
const SHELF_TITLES = [
  "ƒ  FUNCTIONS  ·  reusable instructions, not steps — stages use them with [[Name: …]]",
  "ƒ  FUNCTIONS  ·  stages use them with [[Name: …]]",
  "ƒ  FUNCTIONS  ·  reusable, not steps",
  "ƒ  FUNCTIONS",
];

function shelfTitle(room: number): string {
  return SHELF_TITLES.find((t) => measure("kind", t) <= room) ?? (SHELF_TITLES.at(-1) as string);
}

function rr(x0: number, y0: number, x1: number, y1: number, r: number): string {
  return `M${x0 + r} ${y0}H${x1 - r}Q${x1} ${y0} ${x1} ${y0 + r}V${y1 - r}Q${x1} ${y1} ${x1 - r} ${y1}H${x0 + r}Q${x0} ${y1} ${x0} ${y1 - r}V${y0 + r}Q${x0} ${y0} ${x0 + r} ${y0}Z`;
}


/**
 * A Stages card's shape (fill, then the rough outline with the card radius) stretched over an
 * HTML element, for a node edited in place on the Simple task board: the Task node is drawn as
 * the Goal card is. Measured, so the outline keeps the card's corners at any size.
 */
export function CardFrame({ kind, seed }: { kind: "goal"; seed: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<[number, number] | null>(null);
  useLayoutEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const measure = () => setSize((s) => (s && s[0] === el.offsetWidth && s[1] === el.offsetHeight ? s : [el.offsetWidth, el.offsetHeight]));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [w, h] = size ?? [0, 0];
  const fill = kind === "goal" ? INK.accentSoft : INK.surface;
  return (
    <svg ref={ref} className="stage-svg card-frame" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false">
      {size && w > 0 && (
        <>
          <path d={rr(1, 1, w - 1, h - 1, 7)} fill={fill} />
          <Paths paths={roughRect(1, 1, w - 1, h - 1, 7, { stroke: INK.accent, width: 1.8, seed, roughness: 0.9 })} />
        </>
      )}
    </svg>
  );
}
