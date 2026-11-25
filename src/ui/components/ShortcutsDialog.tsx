// "?" dialog: every action that has a shortcut, grouped by category, as <kbd> chips, plus the
// stage editor's keys (listed on either tab) and the canvas gestures, which are no actions.
import { Fragment } from "react";
import { CATEGORY_ORDER, type AppAction } from "../actions";
import { isMac, keyParts } from "../lib/keys";
import { Dialog } from "./Dialog";

export function ShortcutsDialog({ actions, onClose }: { actions: AppAction[]; onClose: () => void }) {
  const keyed = actions.filter((a) => a.keys?.length && !a.id.startsWith("view.theme."));
  const extra: [string, string[][]][] = [
    ["Close menus and dialogs", [["Esc"]]],
    ["Move between controls", [["Tab"], ["Shift", "Tab"]]],
  ];
  const mod = isMac() ? "⌘" : "Ctrl";
  // The stage keys exist only while the Stages tab is open; list them from the Task tab too.
  const stagesOffTab: [string, string[][]][] = keyed.some((a) => a.category === "Stages")
    ? []
    : [
        ["Add stage", [["S"]]],
        ["Add prompt block", [["P"]]],
        ["Add function block", [["F"]]],
        ["Add intentions block", [["I"]]],
        ["Loop selected blocks", [["L"]]],
        ["Run selected in parallel", [["G"]]],
        ["Zoom to fit", [["⇧", "1"]]],
      ];
  const gestures: [string, string[][]][] = [
    // Short labels so every row stays on one line beside its keys.
    ["Pan on empty space", [["Drag"], ["Space", "Drag"]]],
    ["Scroll", [["Wheel"]]],
    ["Scroll sideways", [["Shift", "Wheel"]]],
    ["Zoom toward the pointer", [[mod, "Wheel"], ["Pinch"]]],
    ["Tick a stage to group it", [["Shift", "Click"]]],
    ["Reorder a stage (drop it on a gap)", [["Drag"]]],
  ];
  type Group = [title: string, rows: [string, string[][]][]];
  const all: Group[] = [
    ...CATEGORY_ORDER.map((cat): Group => [cat, keyed.filter((a) => a.category === cat).map((a): [string, string[][]] => [a.label, distinct((a.keys ?? []).map(keyParts))])]),
    ["Stages tab", stagesOffTab],
    ["Canvas gestures", gestures],
    ["General", extra],
  ];
  const groups = all.filter((g) => g[1].length > 0);
  const columns = balance(groups, COLUMNS);
  const column = (list: typeof groups) => (
    <div className="shortcut-column">
      {list.map(([title, rows]) => (
        <section key={title} className="shortcut-group">
          <h3>{title}</h3>
          {rows.map(([label, combos]) => (
            <Row key={label} label={label} combos={combos} />
          ))}
        </section>
      ))}
    </div>
  );
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose} width="66rem" className="dialog--tall">
      <div className="shortcuts">{columns.map((list, i) => <Fragment key={i}>{column(list)}</Fragment>)}</div>
    </Dialog>
  );
}

/** Three columns on a wide screen, so the whole sheet (Stages tab included) fits at 1440×900;
 *  a narrower dialog wraps the columns and scrolls. */
const COLUMNS = 3;

/** Split the groups, in order, into `n` columns of about the same height (a heading counts as
 *  one and a half rows): each column takes groups until the next would carry it further past
 *  its share than stopping short would leave it. */
function balance<T extends [string, unknown[]]>(groups: T[], n: number): T[][] {
  const weight = (g: T) => g[1].length + 1.5;
  const out: T[][] = [];
  let i = 0;
  for (let c = 0; c < n; c++) {
    const rest = groups.slice(i).reduce((s, g) => s + weight(g), 0);
    const share = rest / (n - c);
    const col: T[] = [];
    let acc = 0;
    while (i < groups.length) {
      const w = weight(groups[i]!);
      if (col.length && c < n - 1 && acc + w / 2 > share) break;
      col.push(groups[i]!);
      acc += w;
      i++;
    }
    if (col.length) out.push(col);
  }
  return out;
}

/** Bindings that print the same (⌘= and ⌘+ both read "⌘ +") are listed once. */
function distinct(combos: string[][]): string[][] {
  const seen = new Set<string>();
  return combos.filter((c) => {
    const k = c.join(" ");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function Row({ label, combos }: { label: string; combos: string[][] }) {
  return (
    <div className="shortcut-row">
      <span>{label}</span>
      <span className="shortcut-keys">
        {combos.map((parts, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="shortcut-or">or</span>}
            <span className="kbd-combo">
              {parts.map((p) => (
                <kbd key={p}>{p}</kbd>
              ))}
            </span>
          </Fragment>
        ))}
      </span>
    </div>
  );
}
