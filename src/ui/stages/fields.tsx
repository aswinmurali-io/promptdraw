// Small form controls for the stage inspector. Entries keep their own draft text while they
// have focus (the Python app's Tk entries do too): the model may normalise a value (strip, default,
// slug), and the field must not jump while the user is still typing.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { Dialog } from "../components/Dialog";
import { HighlightArea } from "../components/HighlightArea";
import { Icon } from "../components/Icon";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { deleteCall, richParts } from "../lib/richText";
import { useDictation, type Dictation } from "../lib/useDictation";
import "../styles/output.css";

export interface DraftInputProps {
  value: string;
  onChange: (v: string) => void;
  /** Reject a keystroke whose result fails (the Python app entry `validatecommand`). */
  accept?: (v: string) => boolean;
  className?: string;
  id?: string;
  label?: string;
  placeholder?: string;
  inputMode?: "numeric" | "decimal" | "text";
  inputRef?: React.Ref<HTMLInputElement>;
  maxLength?: number;
  disabled?: boolean;
}

export function DraftInput({ value, onChange, accept, className, id, label, placeholder, inputMode, inputRef, maxLength, disabled }: DraftInputProps) {
  const [draft, setDraft] = useState(value);
  const own = useRef<HTMLInputElement | null>(null);
  const last = useRef(value);
  useEffect(() => {
    if (value === last.current) return;
    last.current = value;
    if (own.current !== document.activeElement) setDraft(value);
  }, [value]);
  return (
    <input
      ref={(el) => {
        own.current = el;
        if (typeof inputRef === "function") inputRef(el);
        else if (inputRef) (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
      }}
      id={id}
      aria-label={label}
      className={"field " + (className ?? "")}
      value={draft}
      placeholder={placeholder}
      inputMode={inputMode}
      maxLength={maxLength}
      disabled={disabled}
      spellCheck={false}
      autoComplete="off"
      onChange={(e) => {
        const v = e.target.value;
        if (accept && !accept(v)) return;
        setDraft(v);
        onChange(v);
      }}
      onBlur={() => setDraft(last.current)}
    />
  );
}

type TextAreaProps = {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  mono?: boolean;
  label: string;
  areaRef?: React.Ref<HTMLTextAreaElement>;
  /** The Python app `rich=True`: highlight [[calls]], {{FILL_INS}} and **bold**; Backspace / Delete take a whole call. */
  rich?: boolean;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value">;

export function TextArea({ rich, ...props }: TextAreaProps) {
  return rich ? <RichTextArea {...props} /> : <PlainTextArea {...props} />;
}

function PlainTextArea({ value, onChange, rows = 6, mono, label, areaRef, ...rest }: Omit<TextAreaProps, "rich">) {
  return (
    <textarea
      ref={areaRef}
      aria-label={label}
      className={"field insp-text" + (mono ? " field--mono" : "")}
      rows={rows}
      value={value}
      spellCheck={!mono}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

function renderRich(text: string): ReactNode {
  return richParts(text).map((p, i) => (p.kind === "plain" ? p.text : <span key={i} className={RICH_CLASS[p.kind]}>{p.text}</span>));
}

const RICH_CLASS = {
  call: "hl-call",
  flag: "hl-flag",
  fill: "hl-fill",
  stars: "hl-muted",
  bold: "hl-bold",
  code: "hl-code",
  fence: "hl-fence",
  fenceMark: "hl-fence-mark",
  heading: "hl-heading",
  list: "hl-list",
  const: "hl-const",
} as const;

function RichTextArea({ value, onChange, rows = 6, mono, label, areaRef, className, ...rest }: Omit<TextAreaProps, "rich">) {
  const own = useRef<HTMLTextAreaElement | null>(null);
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caret.current === null || !own.current) return;
    own.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [value]);
  return (
    <HighlightArea
      areaRef={(el) => {
        own.current = el;
        if (typeof areaRef === "function") areaRef(el);
        else if (areaRef) (areaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
      }}
      className={"insp-rich" + (mono ? " field--mono" : "") + (className ? " " + className : "")}
      aria-label={label}
      rows={rows}
      value={value}
      render={renderRich}
      spellCheck={!mono}
      onChange={onChange}
      onKeyDown={(e) => {
        if (e.key !== "Backspace" && e.key !== "Delete") return;
        const t = e.currentTarget;
        const res = deleteCall(t.value, t.selectionStart, t.selectionEnd, e.key === "Backspace");
        if (!res) return;
        e.preventDefault();
        caret.current = res.caret;
        onChange(res.text);
      }}
      {...rest}
    />
  );
}

type PromptView = "write" | "preview";
type EditorView = PromptView | "split";

/** A small Write / Preview (/ Split) switch, the same look as the Prompt panel's view switch. */
function ViewSwitch<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="output-view pf-view" role="radiogroup" aria-label={label}>
      {options.map(([v, text, tip]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={"output-view-opt pf-view-" + v} title={tip} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

const VIEWS: [PromptView, string, string][] = [
  ["write", "Write", "Edit the Markdown"],
  ["preview", "Preview", "Read it with code, headings and lists rendered"],
];

const MARKDOWN_HINT = (
  <>
    Markdown: <code>`code`</code> <code>```</code> blocks <code>**bold**</code> <code>#</code> headings <code>-</code> lists
  </>
);

/**
 * A stage's prompt: a rich text area that grows with its text (the inspector body is the one
 * scroller), a Write / Preview switch, and an Expand button that opens the same text in a
 * large editor. Display only: the stored text is exactly what was typed.
 */
export function PromptField({ label, title, value, onChange, placeholder, mono, rows = 4, areaRef }: { label: string; title: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; rows?: number; areaRef?: React.Ref<HTMLTextAreaElement> }) {
  const id = useId();
  const [view, setView] = useState<PromptView>("write");
  const [open, setOpen] = useState(false);
  const own = useRef<HTMLTextAreaElement | null>(null);
  const latest = useRef(value);
  latest.current = value;
  const talk = useDictation(() => latest.current, onChange, () => own.current);
  const ref = (el: HTMLTextAreaElement | null) => {
    own.current = el;
    if (typeof areaRef === "function") areaRef(el);
    else if (areaRef) (areaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
  };
  return (
    <div className="insp-field pf">
      <div className="pf-head">
        <label className="insp-label" htmlFor={view === "write" ? id : undefined} id={id + "-l"}>
          {label}
        </label>
        <ViewSwitch label={`Show the ${label.toLowerCase()} as`} value={view} options={VIEWS} onChange={setView} />
        <MicButton talk={talk} label={label} />
        <button
          type="button"
          className="icon-btn icon-btn--sm pf-expand"
          aria-label={`Expand ${label.toLowerCase()}`}
          title="Open in a large editor"
          onClick={() => {
            talk.stop();
            setOpen(true);
          }}
        >
          <Icon name="expand" size={16} />
        </button>
      </div>
      {view === "write" ? (
        <TextArea id={id} rich label={label} rows={rows} mono={mono} placeholder={placeholder} value={value} onChange={onChange} areaRef={ref} className="pf-area" />
      ) : (
        <div className="pf-preview" role="region" aria-labelledby={id + "-l"} tabIndex={0} title="Double-click to edit" onDoubleClick={() => setView("write")}>
          <MarkdownPreview text={value} empty={placeholder} />
        </div>
      )}
      <DictationStatus talk={talk} />
      {open && <PromptEditor title={title} label={label} value={value} onChange={onChange} placeholder={placeholder} mono={mono} start={view} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Start / stop dictation into a prompt; disabled, with a reason, where the browser has no speech recognition. */
function MicButton({ talk, label }: { talk: Dictation; label: string }) {
  const name = label.toLowerCase();
  const tip = !talk.supported ? "Dictation isn't available in this browser (try Chrome, Edge or Safari)" : talk.listening ? "Stop dictating" : "Dictate: speak and the words go in at the cursor";
  return (
    <button
      type="button"
      className={"icon-btn icon-btn--sm pf-mic" + (talk.listening ? " is-live" : "")}
      aria-label={talk.listening ? `Stop dictating into ${name}` : `Dictate into ${name}`}
      aria-pressed={talk.listening}
      title={tip}
      disabled={!talk.supported}
      // Keep the caret where it is: the phrase goes in there.
      onMouseDown={(e) => e.preventDefault()}
      onClick={talk.toggle}
    >
      <Icon name="mic" size={16} />
    </button>
  );
}

/** What dictation is hearing, or why it stopped; nothing while idle. */
function DictationStatus({ talk }: { talk: Dictation }) {
  if (talk.error) return <p className="pf-dictation pf-dictation--error" role="alert">{talk.error}</p>;
  if (!talk.listening) return null;
  return (
    <p className="pf-dictation" aria-live="polite">
      <span className="pf-dictation-dot" aria-hidden="true" />
      {talk.interim ? <span className="pf-dictation-live">{talk.interim}</span> : "Listening… speak now"}
    </p>
  );
}

/** The large prompt editor: a roomy dialog (full screen on phones) with Write, Preview and Split. */
function PromptEditor({ title, label, value, onChange, placeholder, mono, start, onClose }: { title: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; start: PromptView; onClose: () => void }) {
  const [view, setView] = useState<EditorView>(start);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const latest = useRef(value);
  latest.current = value;
  const talk = useDictation(() => latest.current, onChange, () => area.current);
  const lines = value ? value.split("\n").length : 0;
  // Portalled to the body: inside the inspector island it would sit under the other islands.
  return createPortal(
    <Dialog title={title} onClose={onClose} className="prompt-editor" initialFocus={area}>
      <div className="pe-bar">
        <ViewSwitch
          label={`Show the ${label.toLowerCase()} as`}
          value={view}
          options={[...VIEWS, ["split", "Split", "Write and preview side by side"]]}
          onChange={(v) => setView(v)}
        />
        <MicButton talk={talk} label={label} />
        <span className="pe-hint">{MARKDOWN_HINT}</span>
        <span className="pe-count">
          {lines} {lines === 1 ? "line" : "lines"} · {value.length} chars
        </span>
      </div>
      <div className="pe-body" data-view={view}>
        {view !== "preview" && (
          <div className="pe-pane pe-write">
            <TextArea rich label={label} rows={12} mono={mono} placeholder={placeholder} value={value} onChange={onChange} areaRef={area} className="pe-area" />
          </div>
        )}
        {view !== "write" && (
          <div className="pe-pane pe-read" role="region" aria-label={`${label} preview`} tabIndex={0}>
            <MarkdownPreview text={value} empty={placeholder} />
          </div>
        )}
      </div>
      <DictationStatus talk={talk} />
      <div className="dialog-actions">
        <button type="button" className="btn btn--primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Dialog>,
    document.body,
  );
}

/** A labelled group of fields under a small all-caps heading; sections are ruled apart. */
export function Section({ title, children, aside }: { title?: string; children: ReactNode; aside?: ReactNode }) {
  const id = useId();
  return (
    <section className="insp-section" aria-labelledby={title ? id : undefined}>
      {title && (
        <div className="insp-section-head">
          <h3 id={id} className="insp-section-title">
            {title}
          </h3>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/** One field: a short label, the control (given the label's id), and an optional one-line hint. */
export function Field({ label, hint, children, inline }: { label: ReactNode; hint?: ReactNode; children: (id: string) => ReactNode; inline?: boolean }) {
  const id = useId();
  return (
    <div className={"insp-field" + (inline ? " insp-field--inline" : "")}>
      <label className="insp-label" htmlFor={id}>
        {label}
      </label>
      {children(id)}
      {hint && <p className="insp-hint">{hint}</p>}
    </div>
  );
}

/** Muted explainer copy; `small` is the one-line hint size. */
export function Help({ children, small }: { children: ReactNode; small?: boolean }) {
  return <p className={small ? "insp-hint" : "insp-intro"}>{children}</p>;
}

/** A longer explanation, folded away until asked for. */
export function More({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="insp-more">
      <summary>{summary}</summary>
      <div className="insp-more-body">{children}</div>
    </details>
  );
}

export function Buttons({ children }: { children: ReactNode }) {
  return <div className="insp-buttons">{children}</div>;
}

export function Btn({ children, onClick, disabled, primary, danger, ghost, title }: { children: ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean; danger?: boolean; ghost?: boolean; title?: string }) {
  const cls = "btn btn--sm" + (primary ? " btn--primary" : "") + (danger ? " btn--danger-ghost" : "") + (ghost ? " btn--ghost" : "");
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

export function Radios<T extends string>({ name, value, options, onChange, column, label }: { name: string; value: T; options: [T, string][]; onChange: (v: T) => void; column?: boolean; label?: string }) {
  return (
    <div className={"segmented" + (column ? " segmented--column" : "")} role="radiogroup" aria-label={label}>
      {options.map(([v, label]) => (
        <label key={v} className="seg-option" data-checked={value === v}>
          <input type="radio" className="visually-hidden" name={name} value={v} checked={value === v} onChange={() => onChange(v)} />
          {label}
        </label>
      ))}
    </div>
  );
}

export function Check({ label, checked, onChange, disabled, title, className }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; title?: string; className?: string }) {
  return (
    <label className={"check" + (className ? " " + className : "")} data-disabled={!!disabled} title={title}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
