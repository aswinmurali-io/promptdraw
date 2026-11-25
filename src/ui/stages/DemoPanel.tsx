// Demo workflows on the Stages tab's right edge: each starter as a card with its name, what it
// is for and its size; Open loads it through the discard guard, as File ▾ → Templates does.
// Shown only while nothing is open (the empty default board) and the right edge is free.
// @lat: [[stages#Stage editor#Workflow library#Starter workflows]]
import { useRef } from "react";
import { Icon } from "../components/Icon";
import { POP_OUT, EXIT, useExitGhost, usePanelMotion } from "../lib/motion";
import { STARTERS } from "./starters";

function size(w: (typeof STARTERS)[number]["workflow"]): string {
  const blocks = Array.isArray(w.blocks) ? w.blocks : [];
  const stages = blocks.filter(
    (b) => (b as { type?: string }).type === "stage",
  ).length;
  const loops = Array.isArray(w.loops) ? w.loops.length : 0;
  return (
    `${stages} stage${stages === 1 ? "" : "s"}` +
    (loops ? ` · ${loops} loop${loops === 1 ? "" : "s"}` : "")
  );
}

export function DemoPanel({ onOpen }: { onOpen: (key: string) => void }) {
  const ref = useRef<HTMLElement>(null);
  usePanelMotion(ref, true, "right");
  useExitGhost(ref, { keyframes: POP_OUT, duration: EXIT[2] });
  return (
    <aside ref={ref} className="demo-panel island" aria-labelledby="demo-title">
      <h2 id="demo-title" className="demo-title hand">
        Demo workflows
      </h2>
      <p className="demo-sub">
        Open one to see how stages, loops and parallel groups fit together.
      </p>
      <ul className="demo-list">
        {STARTERS.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              className="demo-card"
              onClick={() => onOpen(s.key)}
              aria-label={`Open the ${s.label} demo`}
            >
              <span className="demo-name">{s.label}</span>
              <span className="demo-hint">{s.hint}</span>
              <span className="demo-meta">
                {size(s.workflow)}
                <span className="demo-open">
                  Open
                  <Icon name="open" size={14} className="demo-arrow" />
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
