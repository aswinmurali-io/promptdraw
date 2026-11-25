// Right island: the live compiled prompt with the Python app's section chips, light markdown
// highlighting, the "N lines · N words" meta line and a character count. Copy is the toolbar's
// primary button, so it never moves. The prompt reads as a formatted Preview (headings, lists,
// bold and code drawn, markdown markers hidden) or as its raw Markdown, which is editable like
// The Python app's output box: Copy always takes the raw text, and any change to the inputs recompiles
// it, dropping hand edits.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { promptMeta } from "../../core";
import { HighlightArea } from "./HighlightArea";
import { gapsLabel, promptGaps, type PromptGap } from "../lib/gaps";
import { chipLabel } from "../lib/chips";
import { changedLines } from "../lib/changedLines";
import { Icon } from "./Icon";
import { usePanelMotion } from "../lib/motion";
import "../styles/output.css";

export interface OutputPanelProps {
  /** Kept mounted but not shown (the stage inspector has the right edge). */
  hidden?: boolean;
  /** The text in the box: the compiled prompt, or the user's edit of it. */
  prompt: string;
  /** The box holds hand edits that differ from the compiled prompt. */
  edited: boolean;
  onEdit: (text: string) => void;
  onRevert: () => void;
  sections: string[];
  /** Placeholders still in the prompt (an empty task or goal), flagged in the header. */
  gaps: PromptGap[];
  /** "hint": a neutral to-do note (nothing attempted yet); "warn": amber, after a copy try. */
  gapTone?: "hint" | "warn";
  onFill: (gap: PromptGap) => void;
  /** The Python app shows "copied to clipboard" in the meta line for 1.6 s after Copy. */
  copied: boolean;
  error?: string | null;
  onClose: () => void;
}

/** How the panel shows the prompt: formatted, or as the raw (editable) Markdown it copies. */
export type PromptView = "preview" | "markdown";
export const PROMPT_VIEW_KEY = "promptdraw:promptView";

function loadView(): PromptView {
  try {
    return localStorage.getItem(PROMPT_VIEW_KEY) === "markdown" ? "markdown" : "preview";
  } catch {
    return "preview";
  }
}

function saveView(v: PromptView): void {
  try {
    localStorage.setItem(PROMPT_VIEW_KEY, v);
  } catch {
    // A per-viewer convenience: without storage the panel still works.
  }
}

export function OutputPanel({ prompt, edited, onEdit, onRevert, sections, gaps, gapTone = "warn", onFill, copied, error, onClose, hidden }: OutputPanelProps) {
  const chars = prompt.replace(/\n+$/, "").length;
  const [view, setViewState] = useState<PromptView>(loadView);
  const [focusEdit, setFocusEdit] = useState(0);
  const ref = useRef<HTMLElement>(null);
  usePanelMotion(ref, !hidden, "right");
  const setView = (v: PromptView) => {
    setViewState(v);
    saveView(v);
  };
  return (
    <aside ref={ref} className="output-panel island" aria-labelledby="output-title" data-inset="right" hidden={hidden}>
      <header className="output-head">
        <h2 id="output-title" className="output-title hand">
          Prompt
        </h2>
        <div className="output-view" role="radiogroup" aria-label="Show the prompt as">
          {(
            [
              ["preview", "Preview", "The prompt formatted for reading"],
              ["markdown", "Markdown", "The raw Markdown that Copy takes; editable"],
            ] as const
          ).map(([v, label, tip]) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} className="output-view-opt" title={tip} onClick={() => setView(v)}>
              {label}
            </button>
          ))}
        </div>
        {edited && (
          <button type="button" className="btn btn--ghost" onClick={onRevert} title="Drop hand edits and show the compiled prompt">
            Revert
          </button>
        )}
        <button type="button" className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Hide prompt panel" title="Hide prompt panel (4)">
          <Icon name="close" size={16} />
        </button>
      </header>
      <ul className="chips" aria-label="Prompt sections">
        {sections.map((s) => (
          <li key={s} className="chip">
            {chipLabel(s)}
          </li>
        ))}
      </ul>
      {gaps.length > 0 && (
        <p className="output-gap" role="note" data-tone={gapTone}>
          <Icon name={gapTone === "warn" ? "alert" : "pencil"} size={16} />
          <span>{gaps.some((g) => g.key === "stage" || g.key === "note") ? `${gapsLabel(gaps)}.` : gapTone === "warn" ? `${gapsLabel(gaps)}: the prompt still has a placeholder.` : `${gapsLabel(gaps)}: fill it in to finish the prompt.`}</span>
          <button type="button" className="output-gap-fill" onClick={() => onFill(gaps[0]!)}>
            Fill in
          </button>
        </p>
      )}
      {error ? (
        <p className="output-error" role="alert">
          {error}
        </p>
      ) : (
        <PromptText
          text={prompt}
          edited={edited}
          onEdit={onEdit}
          view={view}
          focusEdit={focusEdit}
          onEditRequest={() => {
            setView("markdown");
            setFocusEdit((n) => n + 1);
          }}
        />
      )}
      <footer className="output-meta" aria-live="polite">
        <span>{copied ? "copied to clipboard" : promptMeta(prompt)}</span>
        <span data-testid="char-count">{chars.toLocaleString("en-US")} chars</span>
      </footer>
    </aside>
  );
}

/** The prompt's first line: its opening section heading, which names where it came from. */
function firstLine(text: string): string {
  const i = text.indexOf("\n");
  return i < 0 ? text : text.slice(0, i);
}

/** How long the lines a recompile added stay tinted (they fade out over this time). */
export const FLASH_MS = 1600;

interface Flash {
  id: number;
  range: [number, number];
}

/**
 * The prompt box. When a change to the inputs (an intention ticked, a setting changed) adds or
 * changes lines, they are tinted for a moment and the box scrolls the least that shows them, so
 * the effect is visible without hunting for it. Hand edits in the box never flash.
 */
interface PromptTextProps {
  text: string;
  edited: boolean;
  onEdit: (text: string) => void;
  view: PromptView;
  /** Bumped when the preview asked to be edited: the Markdown box takes focus. */
  focusEdit: number;
  onEditRequest: () => void;
}

function PromptText({ text, edited, onEdit, view, focusEdit, onEditRequest }: PromptTextProps) {
  const prev = useRef({ text, edited });
  const [flash, setFlash] = useState<Flash | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const p = prev.current;
    prev.current = { text, edited };
    if (p.text === text) return;
    // A prompt from another source (the Task and Stages tabs open on different sections) is a
    // new document: start it at the top, with no stale offset and no tint over every line.
    if (firstLine(p.text) !== firstLine(text)) {
      const box = boxRef.current?.querySelector<HTMLElement>(".output-text");
      if (box) box.scrollTop = 0;
      setFlash(null);
      return;
    }
    if (edited || p.edited) return;
    const range = changedLines(p.text, text);
    if (!range) return;
    // Typing in a field keeps changing the same lines: extend the running flash, don't restart it.
    setFlash((cur) => (cur && cur.range[0] === range[0] ? { ...cur, range } : { id: (cur?.id ?? 0) + 1, range }));
  }, [text, edited]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(t);
  }, [flash]);
  // Bring the first new line into view (only when it is out of view: no jump otherwise).
  const flashId = flash?.id;
  useEffect(() => {
    if (flashId === undefined) return;
    const box = boxRef.current?.querySelector<HTMLElement>(".output-text");
    const line = box?.querySelector<HTMLElement>(".md-new");
    if (!box || !line) return;
    const b = box.getBoundingClientRect();
    const r = line.getBoundingClientRect();
    if (r.top >= b.top && r.bottom <= b.bottom) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo({ top: box.scrollTop + r.top - b.top - b.height / 3, behavior: reduce ? "auto" : "smooth" });
  }, [flashId]);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusEdit) areaRef.current?.focus();
  }, [focusEdit]);
  return (
    <div ref={boxRef} className="output-text-wrap">
      {view === "preview" ? (
        <div
          className="output-text output-preview"
          role="document"
          aria-label="Compiled prompt preview"
          tabIndex={0}
          title="Double-click to edit the Markdown"
          data-testid="prompt-preview"
          onDoubleClick={onEditRequest}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              onEditRequest();
            }
          }}
        >
          {renderPreview(text, flash)}
        </div>
      ) : (
        <HighlightArea className="output-text" areaRef={areaRef} value={text} onChange={onEdit} render={(t) => renderPrompt(t, flash)} aria-label="Compiled prompt" spellCheck={false} mirrorTestId="prompt-output" />
      )}
    </div>
  );
}

/**
 * The Preview: each prompt line as a block, the way it reads once pasted into a chat that
 * renders Markdown. `##` headings become headings, `- ` bullets and `1.` steps hang their
 * marker, `**bold**` and `` `code` `` are drawn without their markers, and blank lines are
 * small gaps. Line classes match the Markdown view (new lines tinted, waiting lines washed).
 */
function renderPreview(text: string, flash: Flash | null): ReactNode {
  const lines = text.replace(/\n+$/, "").split("\n");
  return lines.map((line, i) => {
    const fresh = !!flash && i >= flash.range[0] && i < flash.range[1];
    const key = fresh ? `${i}:${flash!.id}` : i;
    const extra = [isGapLine(line) ? "md-gap" : "", fresh ? "md-new" : ""].filter(Boolean).join(" ");
    const cls = (base: string) => [base, extra].filter(Boolean).join(" ");
    // A line still waiting for text says so in the preview (only here: the Markdown is the Python app's).
    const hint = isGapLine(line) ? <span className="pv-hint">{line.startsWith("**Note:**") ? "empty prompt block" : "no description yet"}</span> : null;
    if (!line.trim()) return <div key={key} className={cls("pv-gap")} aria-hidden="true" />;
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) return <div key={key} className={cls("pv-h md-h")} role="heading" aria-level={Math.min(6, h[1]!.length + 1)}>{richInline(h[2]!)}</div>;
    const item = /^(\s*)(- |(?:C?\d+[a-z]?)\. )(.*)$/.exec(line);
    if (item) {
      const [, indent, marker, rest] = item as unknown as [string, string, string, string];
      return (
        <div key={key} className={cls("pv-item")} style={indent ? { marginLeft: `${indent.length * 0.5}em` } : undefined}>
          <span className="pv-marker">{marker.trim() === "-" ? "•" : marker.trim()}</span>
          <span className="pv-body">
            {richInline(rest)}
            {hint}
          </span>
        </div>
      );
    }
    return (
      <div key={key} className={cls("pv-p")}>
        {richInline(line)}
        {hint}
      </div>
    );
  });
}

/** **bold** and `code` without their markers; a trailing dangling dash (an empty stage) left out. */
function richInline(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  const src = line.replace(/\s[–—-]\s*$/, "");
  const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g;
  let last = 0;
  let k = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m.index > last) out.push(src.slice(last, m.index));
    const tok = m[0];
    out.push(tok.startsWith("`") ? <code key={k++} className="md-code">{tok.slice(1, -1)}</code> : <strong key={k++}>{tok.slice(2, -2)}</strong>);
    last = m.index + tok.length;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}

/** The Python app `_tag_output`: `##` headings, then inline marks on every other line; lines a recompile
 *  just added are tinted (`md-new`). */
function renderPrompt(text: string, flash: Flash | null): ReactNode {
  return text.split("\n").map((line, i) => {
    const fresh = !!flash && i >= flash.range[0] && i < flash.range[1];
    const cls = [line.startsWith("##") ? "md-h" : "", isGapLine(line) ? "md-gap" : "", fresh ? "md-new" : ""].filter(Boolean).join(" ");
    return (
      // A new flash remounts its lines so the fade starts over.
      <span key={fresh ? `${i}:${flash!.id}` : i} className={cls || undefined}>
        {i > 0 && "\n"}
        {line.startsWith("##") ? line : inline(line)}
      </span>
    );
  });
}

/** A line still waiting for text: a stage or cancel stage with no description, or an empty
 *  prompt block. Marked in the preview (the text itself is the Python app's, byte for byte). */
function isGapLine(line: string): boolean {
  return promptGaps(line).some((g) => g.key === "stage" || g.key === "note");
}

/** `- ` bullet muted, `code` tinted, **bold** bold (the Python app `_tag_output`). The `**` markers and
 *  the dash a stage with no description ends on stay in the text (the prompt is byte-for-byte
 *  The Python app's) but are drawn faint, so the preview reads as a prompt rather than source. */
function inline(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = line;
  const bullet = /^- /.exec(rest);
  if (bullet) {
    out.push(<span key="b" className="md-bullet">{bullet[0]}</span>);
    rest = rest.slice(bullet[0].length);
  }
  const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g;
  let last = 0;
  let k = 0;
  for (let m = re.exec(rest); m; m = re.exec(rest)) {
    if (m.index > last) out.push(rest.slice(last, m.index));
    const tok = m[0];
    out.push(
      tok.startsWith("`") ? (
        <code key={k++} className="md-code">{tok}</code>
      ) : (
        <strong key={k++}>
          <span className="md-mark">**</span>
          {tok.slice(2, -2)}
          <span className="md-mark">**</span>
        </strong>
      ),
    );
    last = m.index + tok.length;
  }
  if (last < rest.length) {
    const tail = rest.slice(last);
    const dash = last > 0 ? /\s[–—-]\s*$/.exec(tail) : null;
    if (dash) {
      if (dash.index > 0) out.push(tail.slice(0, dash.index));
      out.push(<span key="dash" className="md-mark">{dash[0]}</span>);
    } else out.push(tail);
  }
  return out;
}
