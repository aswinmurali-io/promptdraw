// "How to work": the toggles as a fixed panel on the Simple task tab, docked on the right at
// 35% of the window (a pull-up sheet over the tab bar on phones). It shares the right edge with
// the Prompt panel. Each row is a hand-drawn checkbox, the option's name and its one-line
// summary; a chevron opens the exact line it adds to the prompt. Enable rules follow the Python app:
// recon needs workers, and Inline agent only switches workers and recon off. A ticked option's
// own settings sit right under its row (OptionSettings). On wide screens it runs the window's
// full height on the right edge, and its × closes it (a How to work button brings it back). A Reset button beside the search clears
// the task and every option, as Menu → Reset does. What is ticked is
// drawn on the board as parallel lanes (OptionLanes); the prompt keeps TOGGLE_ORDER.
// @lat: [[ui#Canvas#How to work panel]]
import rough from "roughjs";
import {
  memo,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  TOGGLE_ORDER,
  toggleLine,
  type AnyState,
  type AppConfig,
  type ToggleKey,
} from "../../core";
import { HAS_OPTIONS, filterGroups } from "../lib/intentGroups";
import { INTENT_SUMMARY } from "../lib/intentSummaries";
import { toggleBlocked } from "../lib/rules";
import { Icon } from "./Icon";
import { OptionSettings } from "./OptionSettings";
import { TaskFields, type TaskFieldsProps } from "./TaskCanvas";
import { DUR, EXIT, FADE_OUT, enter, useExitGhost } from "../lib/motion";
import "../styles/intentions.css";

const gen = rough.generator();

export interface WorkPanelProps {
  cfg: AppConfig;
  set: (patch: Partial<AppConfig>, coalesce?: string) => void;
  /** build_prompt state, used to show each toggle's exact line with settings filled in. */
  state: AnyState;
  onToggle: (key: ToggleKey, on: boolean) => void;
  /** Ask to reset the task and every option (the Reset… command). */
  onReset: () => void;
  /** Hidden, not closed, while the Prompt panel holds the right edge. */
  hidden?: boolean;
  /** Closed by its × (wide screens; on phones it stays a pull-up sheet). */
  closed?: boolean;
  onClose: () => void;
  /** The Task and Extra notes fields, at the top of the panel. */
  task: TaskFieldsProps;
}

export function WorkPanel({
  cfg,
  set,
  state,
  onToggle,
  onReset,
  hidden,
  closed,
  onClose,
  task,
}: WorkPanelProps) {
  const toggles = cfg.toggles;
  const on = TOGGLE_ORDER.filter((k) => toggles[k]).length;
  // Phones: a handle over the tab bar that pulls the list up as a sheet.
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const groups = filterGroups(query, state);
  // The Task section's share of the panel's height, above the divider (40% unless dragged).
  const [split, setSplitState] = useState(loadSplit);
  const setSplit = (v: number) => {
    const next = clampSplit(v);
    setSplitState(next);
    try {
      localStorage.setItem(SPLIT_KEY, String(next));
    } catch {
      /* private mode: the split holds for this visit only */
    }
  };
  // Coming back: from closed it slides in by its own width; from under the Prompt panel it
  // slides 24px and fades (wide screens; on phones it is a sheet that never closes).
  const ref = useRef<HTMLElement>(null);
  const was = useRef({ hidden, closed });
  useLayoutEffect(() => {
    const prev = was.current;
    was.current = { hidden, closed };
    if (hidden || closed || (!prev.hidden && !prev.closed)) return;
    if (
      typeof matchMedia === "function" &&
      matchMedia("(max-width: 730px)").matches
    )
      return;
    enter(
      ref.current,
      prev.closed && !prev.hidden
        ? [{ transform: "translateX(100%)" }, { transform: "none" }]
        : [
            { opacity: 0, transform: "translateX(24px)" },
            { opacity: 1, transform: "none" },
          ],
      DUR[3],
    );
  }, [hidden, closed]);
  return (
    <aside
      ref={ref}
      className="work-panel island"
      aria-labelledby="intentions-title"
      data-open={open || undefined}
      data-closed={closed || undefined}
      hidden={hidden}
      // On a phone, typing in the Task field (or a jump to it) pulls the sheet up.
      onFocus={(e) => {
        if (e.target instanceof HTMLTextAreaElement) setOpen(true);
      }}
    >
      <div className="work-head">
        <button
          type="button"
          className="work-handle"
          aria-expanded={open}
          aria-controls="work-body"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="work-grip" aria-hidden="true" />
          <h2 id="intentions-title" className="work-title hand">
            How to work
          </h2>
          <span className="intentions-count" data-some={on > 0}>
            {on ? `${on} on` : "none on"}
          </span>
          <Icon name="chevronDown" size={16} className="work-caret" />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--sm work-close"
          onClick={onClose}
          aria-label="Close How to work"
          title="Close How to work"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <div
        className="work-split-area"
        style={{ "--split": split } as CSSProperties}
      >
        <div className="work-top">
          <TaskFields {...task} />
        </div>
        <SplitHandle split={split} onSplit={setSplit} />
        <div id="work-body" className="work-body">
          <div className="work-search" role="search">
            <Icon name="search" size={16} className="work-search-icon" />
            <input
              type="search"
              className="work-search-input"
              placeholder="Search options"
              aria-label="Search How to work options"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && query) {
                  e.stopPropagation();
                  setQuery("");
                }
              }}
            />
            <button
              type="button"
              className="work-reset"
              onClick={onReset}
              title="Reset the task, notes and every option"
            >
              <Icon name="reset" size={15} />
              Reset
            </button>
          </div>
          {!groups.length && (
            <p className="work-empty" role="status">
              No option matches &ldquo;{query.trim()}&rdquo;
            </p>
          )}
          {groups.map(([title, keys]) => (
            <div key={title} className="intent-group">
              <h3 className="intent-group-title">{title}</h3>
              <ul className="work-list" aria-label={title}>
                {keys.map((key) => (
                  <Item key={key}>
                    <WorkRow
                      index={TOGGLE_ORDER.indexOf(key) + 1}
                      id={key}
                      checked={toggles[key]}
                      blocked={toggleBlocked(key, toggles)}
                      line={toggleLine(key, state)}
                      onToggle={onToggle}
                    />
                    {toggles[key] &&
                      !toggleBlocked(key, toggles) &&
                      HAS_OPTIONS.has(key) && (
                        <Options
                          label={`${toggleLine(key, state)[0]} settings`}
                        >
                          <OptionSettings id={key} cfg={cfg} set={set} />
                        </Options>
                      )}
                  </Item>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

const SPLIT_KEY = "promptdraw:workSplit";
export const SPLIT_DEFAULT = 0.4;
const SPLIT_MIN = 0.2;
const SPLIT_MAX = 0.8;

function clampSplit(v: number): number {
  return Math.min(
    SPLIT_MAX,
    Math.max(SPLIT_MIN, Number.isFinite(v) ? v : SPLIT_DEFAULT),
  );
}

function loadSplit(): number {
  try {
    const v = Number(localStorage.getItem(SPLIT_KEY));
    return v ? clampSplit(v) : SPLIT_DEFAULT;
  } catch {
    return SPLIT_DEFAULT;
  }
}

/**
 * The divider between the Task section and the options: drag it (or use the arrow keys, Home and
 * End) to give either side more room; a double-click puts it back at 40%.
 */
function SplitHandle({
  split,
  onSplit,
}: {
  split: number;
  onSplit: (v: number) => void;
}) {
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const area = e.currentTarget.parentElement;
    if (!area || e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const r = area.getBoundingClientRect();
    const move = (ev: PointerEvent) => onSplit((ev.clientY - r.top) / r.height);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };
  const keys: Record<string, number> = {
    ArrowUp: split - 0.05,
    ArrowDown: split + 0.05,
    Home: SPLIT_MIN,
    End: SPLIT_MAX,
  };
  return (
    <div
      className="work-split"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize the task section"
      aria-valuemin={SPLIT_MIN * 100}
      aria-valuemax={SPLIT_MAX * 100}
      aria-valuenow={Math.round(split * 100)}
      tabIndex={0}
      title="Drag to give the task or the options more room (double-click: 40%)"
      onPointerDown={onPointerDown}
      onDoubleClick={() => onSplit(SPLIT_DEFAULT)}
      onKeyDown={(e) => {
        const v = keys[e.key];
        if (v === undefined) return;
        e.preventDefault();
        onSplit(v);
      }}
    >
      <span className="work-split-grip" aria-hidden="true" />
    </div>
  );
}

/** A row of the list: it fades in as the search brings it back, and folds away as it leaves. */
function Item({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLLIElement>(null);
  useExitGhost(ref, { keyframes: FADE_OUT, duration: EXIT[2], collapse: true });
  return <li ref={ref}>{children}</li>;
}

/** A ticked option's settings: they drop in under the row and fold away when it is unticked. */
function Options({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useExitGhost(ref, { keyframes: FADE_OUT, duration: EXIT[2], collapse: true });
  return (
    <div ref={ref} className="work-options" role="group" aria-label={label}>
      {children}
    </div>
  );
}

interface RowProps {
  index: number;
  id: ToggleKey;
  checked: boolean;
  blocked: string | null;
  line: [string, string];
  onToggle: (key: ToggleKey, on: boolean) => void;
}

const WorkRow = memo(function WorkRow({
  index,
  id,
  checked,
  blocked,
  line,
  onToggle,
}: RowProps) {
  const [label, text] = line;
  const inputId = `intent-${id}`;
  const summary = INTENT_SUMMARY[id];
  // At rest: the summary in full, or (with none) the prompt line held to two lines. The chevron
  // always opens the exact line it adds to the prompt.
  const [open, setOpen] = useState(false);
  return (
    <div
      className="work-row"
      data-on={checked}
      data-blocked={blocked !== null}
      title={blocked ?? undefined}
    >
      <label className="work-main" htmlFor={inputId}>
        <input
          id={inputId}
          type="checkbox"
          className="visually-hidden intent-input"
          checked={checked}
          disabled={blocked !== null}
          aria-labelledby={`${inputId}-label`}
          aria-describedby={`${inputId}-desc`}
          onChange={(e) => onToggle(id, e.target.checked)}
        />
        <HandCheck checked={checked} seed={index} />
        <span className="work-words">
          <span id={`${inputId}-label`} className="intent-label">
            {label}
          </span>
          {blocked && (
            <span className="intent-lock" aria-hidden="true">
              <Icon name="lock" size={12} />
              {blocked}
            </span>
          )}
          <span id={`${inputId}-desc`} className="visually-hidden">
            {blocked ? `${blocked}. ` : ""}
            {text}
          </span>
          <span
            id={`${inputId}-text`}
            className="intent-text"
            data-clamp={(!open && !summary) || undefined}
            aria-hidden="true"
          >
            {open || !summary ? text : summary}
          </span>
        </span>
      </label>
      <span className="work-tools">
        <button
          type="button"
          className="work-tool intent-more"
          aria-label={open ? "Show less" : "Show all"}
          title={
            open ? "Show less" : "Show the exact line it adds to the prompt"
          }
          aria-expanded={open}
          aria-controls={`${inputId}-text`}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name="chevronDown" size={15} />
        </button>
      </span>
    </div>
  );
});

/** A wobbly checkbox with a hand-drawn tick. */
export function HandCheck({
  checked,
  seed,
}: {
  checked: boolean;
  seed: number;
}) {
  const paths = useMemo(() => {
    const box = gen.rectangle(2, 2, 18, 18, {
      seed: seed * 13 + 3,
      roughness: 1,
      strokeWidth: 1.3,
    });
    const tick = gen.linearPath(
      [
        [5, 11],
        [9.5, 16],
        [19, 3],
      ],
      { seed: seed * 13 + 4, roughness: 0.9, strokeWidth: 2 },
    );
    return { box: gen.toPaths(box), tick: gen.toPaths(tick) };
  }, [seed]);
  return (
    <svg
      className="hand-check"
      width="22"
      height="22"
      viewBox="0 0 22 22"
      aria-hidden="true"
      focusable="false"
    >
      {paths.box.map((p, i) => (
        <path
          key={`b${i}`}
          d={p.d}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.3}
        />
      ))}
      {checked &&
        paths.tick.map((p, i) => (
          <path
            key={`t${i}`}
            className="hand-tick"
            d={p.d}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          />
        ))}
    </svg>
  );
}
