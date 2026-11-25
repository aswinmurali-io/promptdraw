// A labelled tool button: icon, visible text and the key that triggers it, with a tooltip
// carrying the full name, shortcut and a one-line description. Labels collapse to the icon
// only where CSS says space is short; the name stays in the tooltip and the accessible name.
// @lat: [[ui#Islands]]
import type { ReactNode } from "react";
import { shortcutLabel, type AppAction } from "../actions";
import { Icon } from "./Icon";

export interface ToolButtonProps {
  action: AppAction;
  /** Toggle / mode buttons report their state with aria-pressed. */
  pressable?: boolean;
  tabIndex?: number;
  /** Shown after the label (e.g. a menu caret). */
  after?: ReactNode;
  className?: string;
  title?: string;
  /** Click handler that needs the button (to anchor a menu); replaces `action.perform`. */
  onClickEl?: (el: HTMLButtonElement) => void;
  /** The button opens a menu. */
  haspopup?: boolean;
  /** Print the shortcut badge even when it is a chord such as ⌘K (single keys always show). */
  showKey?: boolean;
}

/** Tooltip text: "Name (key)" then the description on its own line. */
function toolTip(a: Pick<AppAction, "label" | "hint">, key?: string): string {
  const head = key ? `${a.label} (${key})` : a.label;
  return a.hint ? `${head}\n${a.hint}` : head;
}

export function ToolButton({ action: a, pressable, tabIndex, after, className = "", title, onClickEl, haspopup, showKey }: ToolButtonProps) {
  const key = shortcutLabel(a);
  const off = a.enabled === false;
  const text = a.short ?? a.label;
  // The accessible name must contain the visible text (WCAG 2.5.3).
  const name = a.label.toLowerCase().includes(text.toLowerCase()) ? a.label : `${text} (${a.label})`;
  const swapIcon = className.includes("tool-primary");
  return (
    <button
      type="button"
      className={`tool-btn ${className}`.trim()}
      aria-label={name}
      aria-pressed={pressable ? !!a.checked : undefined}
      aria-haspopup={haspopup ? "menu" : undefined}
      aria-keyshortcuts={key}
      data-tooltip={toolTip(a, key)}
      data-copied={(swapIcon && a.icon === "check") || undefined}
      title={title}
      // aria-disabled, not disabled: a greyed-out tool stays focusable and hoverable, so its
      // tooltip can say what it needs (Loop: "Tick one or more blocks in a row…").
      aria-disabled={off || undefined}
      tabIndex={tabIndex}
      onClick={off ? undefined : onClickEl ? (e) => onClickEl(e.currentTarget) : a.perform}
    >
      {a.icon &&
        (swapIcon ? (
          // Copy prompt's icon swaps (copy -> tick): keyed, so the new one fades and draws in.
          <span key={a.icon} className="tool-icon-swap">
            <Icon name={a.icon} />
          </span>
        ) : (
          <Icon name={a.icon} />
        ))}
      {a.phone ? (
        <span className="tool-label">
          <span className="tool-label-wide">{text}</span>
          <span className="tool-label-phone" aria-hidden="true">
            {a.phone}
          </span>
        </span>
      ) : (
        <span className="tool-label">{text}</span>
      )}
      {after}
      {key && (key.length === 1 || showKey) && (
        <span className="tool-key" aria-hidden="true">
          {key}
        </span>
      )}
    </button>
  );
}
