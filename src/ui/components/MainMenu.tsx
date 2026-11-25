// Top-left hamburger island: file commands, help (and Star on GitHub), Reset and the theme switch, all from the
// action registry. Opens a dropdown island; Escape, an outside click or running an item
// closes it. Arrow keys move between items (WAI-ARIA menu button pattern).
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { shortcutLabel, type AppAction } from "../actions";
import { Icon } from "./Icon";
import { EXIT, FADE_OUT, Exit } from "../lib/motion";
import "../styles/menu.css";

const GROUPS: string[][] = [
  ["file.open", "file.saveConfig", "file.exportWorkflow", "file.exportPrompt"],
  ["help.palette", "help.shortcuts", "help.welcome", "help.intro", "help.star"],
  ["file.reset"],
];
const THEMES = ["view.theme.light", "view.theme.dark", "view.theme.auto"];
/** Phones have no floating undo / redo island: the menu carries them. */
const PHONE_GROUP = ["edit.undo", "edit.redo"];

function phone(): boolean {
  return typeof matchMedia === "function" && matchMedia("(max-width: 730px)").matches;
}

export function MainMenu({ actions }: { actions: AppAction[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const byId = new Map(actions.map((a) => [a.id, a]));

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>("[role^=menuitem]:not(:disabled)")?.focus();
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const run = (a: AppAction) => {
    close(a.id.startsWith("view.theme"));
    a.perform();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role^=menuitem]:not(:disabled)") ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      items[(n + items.length) % items.length]?.focus();
    };
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Tab") close(false);
  };

  return (
    <div className="main-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="tool-btn menu-trigger island"
        aria-label="Main menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="main-menu-list"
        data-tooltip={"Main menu\nOpen, save, export, theme and reset"}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="menu" />
        <span className="tool-label">Menu</span>
      </button>
      {open && (
        <Exit opts={{ keyframes: FADE_OUT, duration: EXIT[2] }}>
        <div ref={menuRef} id="main-menu-list" className="menu island" role="menu" aria-label="Main menu" onKeyDown={onKeyDown}>
          {(phone() ? [PHONE_GROUP, ...GROUPS] : GROUPS).map((ids, g) => (
            <div key={g} role="group" className="menu-group">
              {ids.map((id) => {
                const a = byId.get(id);
                if (!a) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    className={"menu-item" + (id === "file.reset" ? " menu-item--danger" : "")}
                    disabled={a.enabled === false}
                    onClick={() => run(a)}
                  >
                    {a.icon && <Icon name={a.icon} size={16} />}
                    <span className="menu-label">{a.label}</span>
                    {shortcutLabel(a) && <span className="menu-shortcut">{shortcutLabel(a)}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          <div role="group" aria-label="Theme" className="menu-group menu-theme">
            <span className="menu-caption">Theme</span>
            <div className="theme-switch">
              {THEMES.map((id) => {
                const a = byId.get(id);
                if (!a) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    role="menuitemradio"
                    tabIndex={-1}
                    aria-checked={!!a.checked}
                    className="theme-option"
                    aria-label={a.label}
                    onClick={() => run(a)}
                  >
                    {a.icon && <Icon name={a.icon} size={16} />}
                    <span>{a.label.replace(/^Theme: /, "")}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        </Exit>
      )}
    </div>
  );
}
