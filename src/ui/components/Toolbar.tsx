// Top-centre tool island: the app's modes (Task prompt / Stages) and panel toggles, each
// labelled in words, with its key (faint until hover or focus) and a described tooltip. Arrow keys move
// focus along the toolbar (roving tabindex); a greyed-out tool is `aria-disabled`, so it takes
// focus like the rest and its tooltip says why it is off. Natively disabled buttons are skipped.
import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { DUR, EASE_OUT, motionOK, settled } from "../lib/motion";
import type { AppAction } from "../actions";
import { ToolButton } from "./ToolButton";
import "../styles/toolbar.css";

/** Modes (one of two, drawn as a segmented control), panel toggles (a glyph for what the panel holds and a
 *  word, tinted while shown), the command palette, then Copy: the app's one primary action, always at the right
 *  end so the toolbar never changes width. */
const GROUPS: [string, string[]][] = [
  ["modes", ["mode.task", "mode.stages"]],
  ["panels", ["panel.props", "panel.output"]],
  ["commands", ["help.palette"]],
  ["primary", ["prompt.copy"]],
];

export function Toolbar({ actions }: { actions: AppAction[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const byId = new Map(actions.map((a) => [a.id, a]));
  const modes = GROUPS[0]![1];
  const active = modes.findIndex((id) => byId.get(id)?.checked);
  // Switching modes: the solid pill slides from the old mode's button to the new one's.
  const was = useRef(active);
  useLayoutEffect(() => {
    const from = was.current;
    was.current = active;
    if (from < 0 || active < 0 || from === active || !motionOK() || !settled()) return;
    const group = ref.current?.querySelector<HTMLElement>(".toolbar-group--modes");
    const btns = group?.querySelectorAll<HTMLElement>(".tool-btn");
    const a = btns?.[from];
    const b = btns?.[active];
    if (!group || !a || !b) return;
    const cs = getComputedStyle(b);
    const pill = document.createElement("span");
    pill.className = "mode-pill";
    pill.setAttribute("aria-hidden", "true");
    Object.assign(pill.style, { left: `${b.offsetLeft}px`, top: `${b.offsetTop}px`, width: `${b.offsetWidth}px`, height: `${b.offsetHeight}px`, background: cs.backgroundColor, borderRadius: cs.borderRadius });
    group.prepend(pill);
    // Until the pill arrives the new mode's words keep the resting ink, so they never vanish.
    b.style.backgroundColor = "transparent";
    b.style.color = getComputedStyle(a).color;
    const anim = pill.animate([{ transform: `translateX(${a.offsetLeft - b.offsetLeft}px) scaleX(${a.offsetWidth / b.offsetWidth})` }, { transform: "none" }], { duration: DUR[2], easing: EASE_OUT });
    const done = () => {
      pill.remove();
      b.style.backgroundColor = "";
      b.style.color = "";
    };
    anim.finished.then(done, done);
  }, [active]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = items[(i + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length];
    e.preventDefault();
    next?.focus();
  };

  return (
    <div ref={ref} className="toolbar island" role="toolbar" aria-label="Modes and panels" onKeyDown={onKeyDown}>
      {GROUPS.map(([name, ids], g) => (
        <div key={name} className={`toolbar-group toolbar-group--${name}`}>
          {g > 0 && <span className="toolbar-divider" aria-hidden="true" />}
          {ids.map((id) => {
            const a = byId.get(id);
            if (!a?.icon) return null;
            const mode = id.startsWith("mode.");
            const toggle = id.startsWith("panel.");
            return <ToolButton key={id} className={name === "primary" ? "tool-primary" : undefined} action={a} pressable={mode || toggle} showKey={name === "commands"} tabIndex={mode ? (a.checked ? 0 : -1) : -1} />;
          })}
        </div>
      ))}
    </div>
  );
}
