// Command palette (Ctrl/Cmd+/ or Ctrl/Cmd+K): fuzzy search over the action registry,
// grouped by category, recent commands first, then the commands of the tab you are on (so the
// first row is one you can use here). Arrow keys move, Enter runs, Escape closes.
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CATEGORY_ORDER, paletteOrder, shortcutLabel, type AppAction } from "../actions";
import { fuzzyScore } from "../lib/fuzzy";
import { loadRecent, saveRecent } from "../lib/recent";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";
import "../styles/palette.css";

interface Row {
  action: AppAction;
  group: string;
}

export function CommandPalette({ actions, onClose }: { actions: AppAction[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const recent = useMemo(loadRecent, []);

  const rows = useMemo((): Row[] => {
    const usable = actions.filter((a) => a.enabled !== false && a.id !== "help.palette");
    if (!query.trim()) {
      const byId = new Map(usable.map((a) => [a.id, a]));
      const rec = recent.map((id) => byId.get(id)).filter((a): a is AppAction => !!a);
      const out: Row[] = rec.map((action) => ({ action, group: "Recent" }));
      for (const cat of paletteOrder(usable)) for (const a of usable) if (a.category === cat && !rec.includes(a)) out.push({ action: a, group: cat });
      return out;
    }
    const scored = usable
      .map((a) => {
        const scores = [a.label, a.category, ...(a.keywords ?? [])].map((t, i) => {
          const s = fuzzyScore(query, t);
          return s === null ? null : s - i * 50;
        });
        const best = Math.max(...scores.map((s) => s ?? -Infinity));
        return { a, best };
      })
      .filter((x) => x.best > -Infinity);
    const cats = CATEGORY_ORDER.map((cat) => {
      const items = scored.filter((x) => x.a.category === cat).sort((x, y) => y.best - x.best);
      return { cat, items, top: items[0]?.best ?? -Infinity };
    })
      .filter((g) => g.items.length)
      .sort((x, y) => y.top - x.top);
    return cats.flatMap((g) => g.items.map((x) => ({ action: x.a, group: g.cat })));
  }, [actions, query, recent]);

  const current = Math.min(active, Math.max(rows.length - 1, 0));

  const run = (a: AppAction) => {
    saveRecent(a.id);
    onClose();
    a.perform();
  };

  const move = (n: number) => {
    const next = (n + rows.length) % Math.max(rows.length, 1);
    setActive(next);
    listRef.current?.querySelector(`#cmd-${next}`)?.scrollIntoView?.({ block: "nearest" });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(current + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(current - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[current];
      if (row) run(row.action);
    }
  };

  return (
    <Dialog title="Command palette" hideTitle onClose={onClose} width="35rem" initialFocus={inputRef} className="palette">
      <div className="palette-search">
        <Icon name="search" size={16} />
        <input
          ref={inputRef}
          className="palette-input"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={rows.length ? `cmd-${current}` : undefined}
          aria-autocomplete="list"
          aria-label="Search commands"
          placeholder="Search commands…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <ul ref={listRef} id="palette-list" className="palette-list" role="listbox" aria-label="Commands">
        {rows.length === 0 && <li className="palette-empty">No matching commands</li>}
        {rows.map((r, i) => (
          <li key={r.group + r.action.id} role="presentation">
            {(i === 0 || rows[i - 1]?.group !== r.group) && (
              <div className="palette-group" role="presentation">
                {r.group}
              </div>
            )}
            <div
              id={`cmd-${i}`}
              role="option"
              aria-selected={i === current}
              className="palette-row"
              onMouseMove={() => i !== current && setActive(i)}
              onClick={() => run(r.action)}
            >
              <span className="palette-icon" aria-hidden="true">
                {r.action.icon && <Icon name={r.action.icon} size={16} />}
              </span>
              <span className="palette-label">{r.action.label}</span>
              {r.action.checked && <Icon name="check" size={14} className="palette-check" />}
              {shortcutLabel(r.action) && <kbd>{shortcutLabel(r.action)}</kbd>}
            </div>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
