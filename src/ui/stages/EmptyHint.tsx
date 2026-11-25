// The empty workflow's handwritten nudge, a whiteboard-style empty-canvas hint: a note with a
// rough arrow pointing at the tool that adds the first stage: the Stage tool (or Add ▾) in the
// bar at the foot of the canvas, or under the toolbar on tablets (on phones a note above the
// zoom row names the Add button instead). Decorative: the status line and
// the tools' own names say the same to assistive tech.
// @lat: [[stages#Islands and menus]]
import { useLayoutEffect, useState } from "react";
import type { Box } from "../../core";
import { RoughArrow } from "../components/RoughFrame";
import { toScreen, type Viewport } from "./viewport";

const DOWN_UP: [number, number][] = [[50, 52], [30, 34], [12, 6]];

interface Anchor {
  x: number;
  y: number;
  /** Under a tool at the top, over a tool at the foot (arrow pointing down), or a phone note. */
  at: "below" | "above" | "note";
}

/** Where the hint goes: by the first visible add tool. */
function anchor(): Anchor | null {
  const tools = Array.from(document.querySelectorAll<HTMLElement>(".stage-bar .stage-direct, .stage-bar .stage-add"));
  const el = tools.find((t) => t.getBoundingClientRect().width > 0);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.top < window.innerHeight / 2) return { x: r.left + r.width / 2, y: r.bottom, at: "below" };
  if (window.innerWidth > 730) return { x: r.left + r.width / 2, y: r.top, at: "above" };
  // Phones: the bar is at the bottom under the zoom row, so the note sits above that row,
  // centred, and names the button instead of pointing across the islands.
  const row = document.querySelector<HTMLElement>(".region--bottom-left")?.getBoundingClientRect();
  return { x: window.innerWidth / 2, y: row && row.height ? row.top : r.top, at: "note" };
}

const UP_DOWN: [number, number][] = [[50, 4], [30, 22], [12, 50]];

export function EmptyHint() {
  const [at, setAt] = useState<Anchor | null>(null);
  useLayoutEffect(() => {
    const place = () => setAt(anchor());
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, []);
  if (!at) return null;
  const words = (
    <span>
      Add your first stage
      <br />
      <small>or press S</small>
    </span>
  );
  return (
    <div
      className="stage-empty-hint"
      data-at={at.at}
      aria-hidden="true"
      data-testid="stage-empty-hint"
      style={at.at === "below" ? { left: at.x, top: at.y + 6 } : { left: at.x, bottom: window.innerHeight - at.y + (at.at === "above" ? 4 : 14) }}
    >
      {at.at === "below" && <RoughArrow seed={17} width={60} height={56} points={DOWN_UP} />}
      {at.at === "above" && <RoughArrow seed={17} width={60} height={56} points={UP_DOWN} />}
      {at.at === "note" ? <span>Tap Add below for your first stage</span> : words}
    </div>
  );
}

/**
 * On an empty workflow, handwritten notes with rough arrows that say what the two fixed cards
 * are for: the Goal (above it, arrow down) and the on-cancel lane (below it, arrow up). They
 * sit in board coordinates, so they pan and zoom with the cards, at a fixed readable size.
 */
export function CardNotes({ view, cards }: { view: Viewport; cards: Map<string, Box> }) {
  const goal = cards.get("goal");
  const cancel = cards.get("on_cancel");
  return (
    <>
      {goal && (
        <div className="stage-card-note" data-at="above" aria-hidden="true" data-testid="goal-note" style={pin(view, goal[0], goal[1])}>
          <RoughArrow seed={23} width={60} height={56} points={UP_DOWN} />
          <span>
            The goal: what “done” looks like
            <br />
            <small>every stage works toward it · click to write it</small>
          </span>
        </div>
      )}
      {cancel && (
        <div className="stage-card-note" data-at="below" aria-hidden="true" data-testid="cancel-note" style={pin(view, cancel[0], cancel[3])}>
          <RoughArrow seed={31} width={60} height={56} points={DOWN_UP} />
          <span>
            Runs only if you cancel the run
            <br />
            <small>short clean-up steps, e.g. undo edits, save a report</small>
          </span>
        </div>
      )}
    </>
  );
}

/** Screen position for a note hung off a card edge at world (x, y), arrow tip a little in from its left. */
function pin(view: Viewport, x: number, y: number): React.CSSProperties {
  const [sx, sy] = toScreen(view, x, y);
  return { left: sx + 28, top: sy };
}
