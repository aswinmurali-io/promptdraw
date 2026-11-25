// First-run welcome: a hand-drawn wordmark card with quick actions on the canvas, plus
// handwritten hints with rough.js arrows pointing at the menu, toolbar and help.
// It ignores the pointer except on its own buttons, and goes away for good once a task is
// typed or it is dismissed.
import { shortcutLabel, type AppAction } from "../actions";
import { Icon } from "./Icon";
import { RoughArrow, RoughFrame } from "./RoughFrame";
import "../styles/welcome.css";

const MENU_ARROW: [number, number][] = [[56, 26], [32, 24], [6, 14]];
const TOOLBAR_ARROW: [number, number][] = [[56, 26], [32, 22], [6, 18]];
// Left to right, ending at the Help island (the hint sits just left of it, under the panels).
const HELP_ARROW: [number, number][] = [[4, 12], [30, 22], [56, 18]];
const QUICK = ["file.open", "prompt.focusTask", "help.palette", "help.shortcuts"];
const KEYBOARD_ONLY = new Set(["help.palette", "help.shortcuts"]);
/** The whole job in three steps; the third points at the toolbar's Copy (see WelcomeArrows).
 *  Each is a verb and the rest: a narrow card keeps just the verbs on one line. */
const STEPS: [string, string][] = [
  ["Describe", " the task"],
  ["Tick", " how the agent should work"],
  ["Copy", " the prompt"],
];

export function WelcomeCard({ actions, onDismiss }: { actions: AppAction[]; onDismiss: () => void }) {
  const byId = new Map(actions.map((a) => [a.id, a]));
  return (
    <section className="welcome-card sketch-card" aria-labelledby="welcome-title">
      <RoughFrame seed={7} roughness={1.4} />
      <h2 id="welcome-title" className="welcome-wordmark hand">
        promptdraw
      </h2>
      <ol className="welcome-steps" aria-label="How it works">
        {STEPS.map(([verb, rest], i) => (
          <li key={verb}>
            <span className="welcome-step-n" aria-hidden="true">
              {i + 1}
            </span>
            <span>
              {verb}
              <span className="welcome-step-rest">{rest}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="welcome-sub muted">A ready-to-paste prompt for your coding agent. Everything stays in this browser.</p>
      <ul className="welcome-actions">
        {QUICK.map((id) => {
          const a = byId.get(id);
          if (!a) return null;
          return (
            // The palette and the shortcuts list are keyboard tools: touch screens skip them.
            <li key={id} data-keys={KEYBOARD_ONLY.has(id) || undefined}>
              <button type="button" className="welcome-action" onClick={a.perform}>
                {a.icon && <Icon name={a.icon} size={16} />}
                <span>{a.label}</span>
                {shortcutLabel(a) && <kbd>{shortcutLabel(a)}</kbd>}
              </button>
            </li>
          );
        })}
        <li className="welcome-dismiss-item">
          <button type="button" className="btn btn--sm btn--outline welcome-dismiss" onClick={onDismiss}>
            Got it
          </button>
        </li>
      </ul>
    </section>
  );
}

/** Handwritten labels with arrows toward the islands they describe (decorative). */
export function WelcomeArrows() {
  return (
    <div className="welcome-arrows" aria-hidden="true">
      <div className="hint hint--menu">
        <RoughArrow seed={3} width={60} height={36} points={MENU_ARROW} />
        <span>Open, save &amp; theme</span>
      </div>
      <div className="hint hint--toolbar">
        <RoughArrow seed={5} width={60} height={36} points={TOOLBAR_ARROW} />
        <span>3 · Copy it here</span>
      </div>
      <div className="hint hint--help">
        <span>All the shortcuts</span>
        <RoughArrow seed={13} width={60} height={32} points={HELP_ARROW} />
      </div>
    </div>
  );
}
