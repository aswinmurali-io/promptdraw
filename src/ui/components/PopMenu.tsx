// A floating menu island at a point (context menu, the stage add menu, Load ▾). Rows have an
// optional hint and shortcut, groups are split by separators, headers are disabled labels.
// Arrow keys move, Enter runs, Escape or a click outside closes (WAI-ARIA menu pattern).
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import "../styles/menu.css";
import { EXIT, FADE_OUT, useExitGhost } from "../lib/motion";

export type PopItem =
  | { label: string; hint?: string; shortcut?: string; disabled?: boolean; danger?: boolean; checked?: boolean; onSelect: () => void }
  | { separator: true }
  | { header: string };

export interface PopMenuProps {
  x: number;
  y: number;
  items: PopItem[];
  label: string;
  /** Open upward from `y` (a button at the foot of the screen): `y` is the menu's bottom. */
  above?: boolean;
  onClose: () => void;
}

export function PopMenu({ x, y, items, label, above, onClose }: PopMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useExitGhost(ref, { keyframes: FADE_OUT, duration: EXIT[2] });
  const [pos, setPos] = useState({ left: x, top: y });
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Keep the menu on screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const top = above ? y - r.height : y + r.height > vh - 8 ? y - r.height : y;
    setPos({ left: Math.max(8, Math.min(x, vw - r.width - 8)), top: Math.max(8, top) });
  }, [x, y, above]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[role=menuitem]:not(:disabled)")?.focus();
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeRef.current();
    };
    const blur = () => closeRef.current();
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("blur", blur);
    window.addEventListener("resize", blur);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      window.removeEventListener("blur", blur);
      window.removeEventListener("resize", blur);
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    const rows = Array.from(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not(:disabled)") ?? []);
    const i = rows.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      rows[(n + rows.length) % rows.length]?.focus();
    };
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(rows.length - 1);
    else if (e.key === "Tab") onClose();
  };

  return (
    <div ref={ref} className="menu pop-menu island" role="menu" aria-label={label} style={{ left: pos.left, top: pos.top }} onKeyDown={onKeyDown} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) => {
        if ("separator" in it) return <div key={i} className="pop-sep" role="separator" />;
        if ("header" in it)
          return (
            <div key={i} className="pop-header" role="presentation">
              {it.header}
            </div>
          );
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={"menu-item" + (it.danger ? " menu-item--danger" : "")}
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onSelect();
            }}
          >
            <span className="menu-label">
              {it.label}
              {it.hint && <span className="pop-hint"> · {it.hint}</span>}
            </span>
            {it.shortcut && <span className="menu-shortcut">{it.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
}
