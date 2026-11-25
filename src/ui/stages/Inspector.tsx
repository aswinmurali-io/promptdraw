// The selection-driven right-hand panel on the Stages tab: The Python app's Inspector pane, one form per
// focus (goal, stage, prompt block, function, intentions, loop, parallel group, on-cancel
// header, cancel stage). Every field writes through the pure edit helpers, so typing is
// undoable (merged per field) and the prompt panel follows keystroke by keystroke.
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  NO_MODEL,
  STAGE_MODELS,
  TEMPLATES,
  cleanFlags,
  filled,
  fmtAny,
  hasKey,
  pyRepr,
  type AnyState,
  type Block,
  type Loop,
  type Parallel,
} from "../../core";
import { Icon } from "../components/Icon";
import { digitsOk } from "../lib/rules";
import * as E from "./edits";
import { Btn, Check, DraftInput, Field, Help, More, PromptField, Radios, Section, TextArea } from "./fields";
import { IntentionsForm } from "./IntentionsForm";
import type { StagesController } from "./useStages";
import { DOCK_MIN, clampWidth } from "./dock";
import { motionOk } from "./viewport";
import "../styles/inspector.css";

/** What an unnamed stage is called, on its card and in the inspector's title. */
const UNTITLED = "Untitled stage";
/** The Name field's placeholder: an invitation with an example, not a second "Untitled stage". */
const NAME_HINT = "Name this stage, e.g. Reproduce the bug";

export interface InspectorProps {
  ctl: StagesController;
  width: number;
  onWidth: (w: number) => void;
  /** "+ Branch": open the add menu (stage entries only) under this button. */
  onAddBranch: (anchor: HTMLElement, par: string) => void;
  /** The git, worktree, commit and Unity settings, shown under an Intentions block's toggles. */
  settings?: ReactNode;
}

/** How long the panel takes to fold away after a click elsewhere (ms); matches `insp-out`. */
export const DOCK_OUT_MS = 180;

const winW = () => (typeof window === "undefined" ? 1440 : window.innerWidth);

/** The window's width, kept current so a default-width panel follows a resize. */
function useWindowWidth(): number {
  const [w, setW] = useState(winW);
  useEffect(() => {
    const on = () => setW(winW());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}

/**
 * Clicks that do not leave the panel: inside it, on the stage canvas (which focuses the card it
 * hits and clears focus on empty board itself), the zoom and history row, and menus and dialogs.
 */
const KEEPS_OPEN = ".inspector, .stage-surface, .region--bottom-left, [role='menu'], [role='dialog'], [role='listbox'], .pop-menu";

/**
 * A pointer press anywhere else folds the panel away. Its last frame is left behind as an inert
 * copy that slides out (`insp-out`) while the canvas glides into the room it frees.
 */
function useCollapseOnOutside(node: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Element) || !t.isConnected || t.closest(KEEPS_OPEN)) return;
      closeRef.current();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);
  // Leave a sliding copy behind when the panel unmounts (closed by any route: Esc, ×, a click).
  useEffect(() => {
    if (!open) return;
    const el = node.current;
    const parent = el?.parentElement;
    return () => {
      if (!el || !parent || !parent.isConnected || typeof window === "undefined") return;
      if (!motionOk() || window.innerWidth <= 730) return;
      const ghost = el.cloneNode(true) as HTMLElement;
      // A clone keeps the fields' first values; show what was typed since.
      const live = el.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>("textarea, input");
      ghost.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>("textarea, input").forEach((f, i) => {
        if (live[i]) f.value = live[i].value;
      });
      ghost.classList.add("inspector--leaving");
      ghost.removeAttribute("data-inset");
      ghost.removeAttribute("id");
      ghost.setAttribute("aria-hidden", "true");
      ghost.setAttribute("inert", "");
      ghost.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
      parent.appendChild(ghost);
      window.setTimeout(() => ghost.remove(), DOCK_OUT_MS + 40);
    };
  }, [open, node]);
}

export function Inspector({ ctl, width, onWidth, onAddBranch, settings }: InspectorProps) {
  const { selection, scene } = ctl;
  const focus = selection.focus;
  const windowW = useWindowWidth();
  const first = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const setFirst = (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (el && !first.current) first.current = el;
  };
  first.current = null;

  useEffect(() => {
    if (ctl.fieldToken) first.current?.focus();
  }, [ctl.fieldToken]);

  const panel = useRef<HTMLElement | null>(null);
  useCollapseOnOutside(panel, !!focus, () => ctl.setFocus(null));

  if (!focus) return null;
  const { wf, nums } = scene;
  let body: ReactNode = null;
  let title = "Inspector";
  // A stage's header mirrors its card: "STAGE 6" above, its name (or "Untitled stage") as the title.
  let eyebrow: string | null = null;
  let untitled = false;
  let sub: string | null = null;
  if (focus.kind === "goal") {
    title = "Goal";
    sub = "Always first";
    body = <GoalForm ctl={ctl} setFirst={setFirst} />;
  } else if (focus.kind === "block") {
    const b = wf.block(focus.id);
    if (b) {
      title = b.type === "function" ? "Function" : b.type === "intentions" ? "Intentions" : "Prompt block";
      if (b.type === "stage") {
        eyebrow = "Stage " + (nums[b.id] ?? "").toUpperCase();
        const name = String(b.name ?? "").trim();
        title = name || UNTITLED;
        untitled = !name;
      }
      const p = wf.parOf(b.id);
      const lp = wf.loopOf(b.id);
      const where = [p && "Parallel branch", lp && (wf.parentLoop(lp) ? "in a nested loop" : "in a loop")].filter(Boolean).join(" · ");
      const w = where.charAt(0).toUpperCase() + where.slice(1);
      if (b.type === "function") {
        const n = wf.callers(String(b.name ?? "")).length;
        sub = n ? `On the shelf · used by ${n}` : "On the shelf · not used yet";
      } else if (b.type === "intentions") sub = "The prompt's “How to work” section";
      else if (b.type === "prompt") sub = w || "Added at this point in the flow";
      else sub = w || null;
      body = <BlockForm key={b.id} ctl={ctl} b={b} setFirst={setFirst} settings={settings} />;
    }
  } else if (focus.kind === "loop") {
    const l = wf.loop(focus.id);
    if (l) {
      title = "Loop";
      sub = wf.loopSpan(l);
      body = <LoopForm key={l.id} ctl={ctl} l={l} setFirst={setFirst} />;
    }
  } else if (focus.kind === "par") {
    const p = wf.par(focus.id);
    if (p) {
      title = "Parallel group";
      sub = `${p.blocks.length} branches at the same time`;
      body = <ParForm ctl={ctl} p={p} onAddBranch={onAddBranch} />;
    }
  } else if (focus.kind === "oncancel") {
    title = "On cancel";
    sub = "Runs after you press Cancel";
    body = <OnCancelForm ctl={ctl} setFirst={setFirst} />;
  } else if (focus.kind === "cancel") {
    eyebrow = `Cancel stage ${focus.i + 1}`;
    const name = ctl.workflow.on_cancel.stages[focus.i]?.name.trim() ?? "";
    title = name || UNTITLED;
    untitled = !name;
    sub = "Runs in order after you cancel";
    body = <CancelForm key={focus.i} ctl={ctl} i={focus.i} setFirst={setFirst} />;
  }
  if (!body) return null;

  return (
    <aside ref={panel} className="props-panel inspector island" aria-labelledby={eyebrow ? "inspector-eyebrow inspector-title" : "inspector-title"} data-inset="right" style={{ width: clampWidth(width, windowW) }}>
      <header className="insp-header">
        <div className="insp-titles">
          {eyebrow && (
            <p id="inspector-eyebrow" className="insp-eyebrow">
              {eyebrow}
            </p>
          )}
          <h2 id="inspector-title" className="props-title insp-title" data-untitled={untitled || undefined} title={title}>
            {title}
          </h2>
          {sub && (
            <p className="insp-subtitle" title={sub} data-testid="inspector-subtitle">
              {sub}
            </p>
          )}
        </div>
        <button type="button" className="icon-btn icon-btn--sm insp-close" onClick={() => ctl.setFocus(null)} aria-label="Close inspector" title="Close inspector (Esc)">
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="insp-body">{body}</div>
      <ResizeHandle width={width} onWidth={onWidth} />
    </aside>
  );
}

type SetFirst = (el: HTMLInputElement | HTMLTextAreaElement | null) => void;

function GoalForm({ ctl, setFirst }: { ctl: StagesController; setFirst: SetFirst }) {
  return (
    <>
      <Section>
        <PromptField label="Goal" title="Goal" areaRef={setFirst} rows={5} placeholder="What should be true when the workflow is done? e.g. The login button works on mobile Safari, with a test." value={ctl.workflow.goal} onChange={(v) => ctl.change(E.setGoal(ctl.workflow, v), "goal")} />
      </Section>
      <FlagsEditor ctl={ctl} />
    </>
  );
}

const FLAG_NAME_OK = (v: string) => v === "" || /^[a-z][a-z0-9_]*$/.test(v);

/** Declare the workflow's prompt flags (A/B variants): name, bool or text, default and a label. */
function FlagsEditor({ ctl }: { ctl: StagesController }) {
  const d = ctl.workflow;
  const defs = cleanFlags(d.flags);
  const problems = ctl.scene.wf.flagProblems();
  return (
    <Section title="Prompt flags" aside={<Btn onClick={() => ctl.change(E.addFlag(d))}>+ Add flag</Btn>}>
      {defs.length === 0 ? (
        <Help small>
          A flag makes one workflow compile to several prompts (A/B). Add one, then give a block a <code>when</code> or write <code>{"{{#if flag}}…{{#else}}…{{/if}}"}</code> in a prompt.
        </Help>
      ) : (
        <Help small>Choose which variant the prompt follows from the Flags tool in the stage bar.</Help>
      )}
      {defs.map((f) => (
        <div key={f.name} className="insp-flag" role="group" aria-label={`Flag ${f.name}`}>
          <div className="insp-flag-head">
            <Field label="Name" inline>
              {(fid) => <DraftInput id={fid} label={`Flag ${f.name} name`} className="field--mono" value={f.name} accept={FLAG_NAME_OK} onChange={(v) => ctl.change(E.updateFlag(d, f.name, { name: v }), `flag:${f.name}:name`)} />}
            </Field>
            <Btn ghost danger title="Remove this flag" onClick={() => ctl.change(E.removeFlag(d, f.name))}>
              Remove
            </Btn>
          </div>
          <Radios
            name={`flag-type-${f.name}`}
            label={`${f.name} kind`}
            value={f.type}
            options={[
              ["bool", "On / off"],
              ["text", "Text"],
            ]}
            onChange={(v) => ctl.change(E.updateFlag(d, f.name, { type: v }))}
          />
          {f.type === "bool" ? (
            <Check label="On by default" checked={f.default === true} onChange={(v) => ctl.change(E.updateFlag(d, f.name, { default: v }))} />
          ) : (
            <Field label="Default value">
              {(fid) => <DraftInput id={fid} label={`Flag ${f.name} default`} value={String(f.default)} onChange={(v) => ctl.change(E.updateFlag(d, f.name, { default: v }), `flag:${f.name}:default`)} />}
            </Field>
          )}
          <Field label="Label" hint="Shown beside the flag in the stage bar">
            {(fid) => <DraftInput id={fid} label={`Flag ${f.name} label`} value={f.label ?? ""} onChange={(v) => ctl.change(E.updateFlag(d, f.name, { label: v }), `flag:${f.name}:label`)} />}
          </Field>
        </div>
      ))}
      {problems.length > 0 && (
        <ul className="insp-problems">
          {problems.map((x) => (
            <li key={x}>⚠ {x}</li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** The `{{#if}}` branches inside a block's text: each chain's branches as rows, the one the flags choose marked. Read-only. */
function BranchesSection({ ctl, b }: { ctl: StagesController; b: Block }) {
  const info = ctl.scene.inline?.get(b.id);
  if (!info) return null;
  const strip = ctl.flagMode === "strip";
  const snip = (t: string) => (t.length > 160 ? t.slice(0, 160).trimEnd() + "…" : t || "(nothing)");
  return (
    <Section title="A/B branches" aside={<Btn onClick={() => ctl.openFlags(info.flags[0] ?? "")}>Flags</Btn>}>
      <Help small>
        The text changes with {info.flags.length ? info.flags.join(", ") : "a flag"}. {strip ? "Only the chosen branch stays in the prompt." : "Every branch stays in the prompt, labelled, with the chosen one named."}
      </Help>
      {info.chains.map((c, ci) => (
        <ol key={ci} className="insp-branches" data-testid="branches-chain" aria-label={`Branches on ${c.flag || "a flag"}`}>
          {c.branches.map((r) => (
            <li key={r.letter} className="insp-branch" data-chosen={r.chosen || undefined}>
              <span className="insp-branch-letter" aria-hidden="true">{r.letter}</span>
              <div className="insp-branch-body">
                <b>Variant {r.letter} · {r.cond ?? "otherwise"}</b>
                <span className="insp-branch-state">{r.chosen ? "chosen" : strip ? "removed" : "kept, marked skipped"}</span>
                <p>{snip(r.body)}</p>
              </div>
            </li>
          ))}
        </ol>
      ))}
    </Section>
  );
}

/** "Show when": the block takes part only when the flag condition holds; a variant letter says which A/B side it is. */
function WhenSection({ ctl, b }: { ctl: StagesController; b: Block }) {
  const d = ctl.workflow;
  const when = typeof b.when === "string" ? b.when : "";
  const v = ctl.scene.variants?.get(b.id);
  const [draft, setDraft] = useState(when);
  useEffect(() => setDraft(when), [when, b.id]);
  const problem = E.whenProblem(d, draft);
  const hasFlags = (d.flags ?? []).length > 0;
  return (
    <Section title="Show when">
      <Field label="Condition" hint={hasFlags ? 'A flag, !flag, flag == "text" or flag != "text". Blank: always shown.' : "Declare a flag on the Goal first. Blank: always shown."}>
        {(fid) => (
          <DraftInput
            id={fid}
            label="Show when"
            className="field--mono"
            placeholder={'e.g. play_bot, !play_bot, variant == "b"'}
            value={when}
            onChange={(next) => {
              setDraft(next);
              if (E.whenProblem(d, next) === null) ctl.change(E.setBlockWhen(d, b.id, next), `${b.id}:when`);
            }}
          />
        )}
      </Field>
      {problem && <p className="insp-when-error" role="alert">{problem}</p>}
      {v && !problem && (
        <p className="insp-hint" data-testid="variant-note">
          Variant {v.letter} of {v.flag}: {v.selected ? "chosen by the flag values" : ctl.flagMode === "strip" ? "not chosen, so removed from the prompt" : "not chosen, kept in the prompt marked as skipped"}.
        </p>
      )}
    </Section>
  );
}

/** The read-only box's tooltip: what ticking it does. */
const READ_ONLY_HINT = "The worker edits no project files and saves its report to disk.";

function ModelField({ value, onChange, hint }: { value: unknown; onChange: (v: string) => void; hint?: ReactNode }) {
  return (
    <Field label="Model" hint={hint}>
      {(fid) => (
        <select id={fid} className="field" aria-label="Model hint" value={STAGE_MODELS.includes(value as never) ? String(value) : NO_MODEL} onChange={(e) => onChange(e.target.value)}>
          {[NO_MODEL, ...STAGE_MODELS].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      )}
    </Field>
  );
}

function jump(ctl: StagesController, id: string) {
  ctl.setFocus({ kind: "block", id }, [id]);
  ctl.scrollTo(id);
}

/** The destructive action, apart from reordering: last in the body, under its own rule. */
function DangerZone({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="insp-danger">
      <button type="button" className="btn btn--sm btn--danger-ghost" onClick={onClick}>
        <Icon name="trash" size={16} />
        {label}
      </button>
    </div>
  );
}

function BlockForm({ ctl, b, setFirst, settings }: { ctl: StagesController; b: Block; setFirst: SetFirst; settings?: ReactNode }) {
  const { wf } = ctl.scene;
  const d = ctl.workflow;
  const id = b.id;
  const p = wf.parOf(id);
  const lp = wf.loopOf(id);
  const ck = (f: string) => `${id}:${f}`;
  let form: ReactNode;

  if (b.type === "stage") {
    const edited = E.templateEdited(b);
    const t = hasKey(TEMPLATES, b.template) ? TEMPLATES[b.template] : null;
    form = (
      <>
        <Section>
          <div className="insp-name-row">
            <Field label="Name">
              {(fid) => <DraftInput id={fid} label="Stage name" inputRef={setFirst} placeholder={NAME_HINT} value={String(b.name ?? "")} onChange={(v) => ctl.change(E.setBlockField(d, id, "name", v), ck("name"))} />}
            </Field>
            <ModelField value={b.model} onChange={(v) => ctl.change(E.setModel(d, { block: id }, v))} />
            <Check className="insp-ro" label="Read-only" title={READ_ONLY_HINT} checked={!!b.read_only} onChange={(v) => ctl.change(E.setBlockField(d, id, "read_only", v))} />
          </div>
          <PromptField label="Prompt description" title={`Stage ${(ctl.scene.nums[id] ?? "").toUpperCase()} · ${String(b.name ?? "").trim() || UNTITLED}`} placeholder="What should the agent do in this stage?" value={String(b.prompt ?? "")} onChange={(v) => ctl.change(E.setBlockField(d, id, "prompt", v), ck("prompt"))} />
        </Section>
        <UsesPanel ctl={ctl} b={b} />
        {t && (
          <Section>
            <div className="insp-template">
              <span>
                From the <strong>{t.name}</strong> template{edited ? " · edited" : ""}
              </span>
              <Btn ghost disabled={!edited} onClick={() => ctl.change(E.resetTemplate(d, id))}>
                Reset
              </Btn>
            </div>
          </Section>
        )}
      </>
    );
  } else if (b.type === "intentions") {
    form = (
      <Section>
        <Help small>Delete this block to leave the section out of the prompt.</Help>
        <IntentionsForm block={b} onChange={(values: AnyState, c) => ctl.change(E.setIntentions(d, id, values), c ? ck(c) : undefined)} />
      </Section>
    );
    // The Settings panel's git, worktree, commit and Unity groups live here on the Stages tab.
    if (settings)
      form = (
        <>
          {form}
          <Section title="Workspace & Unity">
            <div className="insp-settings">{settings}</div>
          </Section>
        </>
      );
  } else if (b.type === "function") {
    form = <FunctionForm ctl={ctl} b={b} setFirst={setFirst} />;
  } else {
    form = (
      <>
        <Section>
          <PromptField label="Prompt text" title="Prompt block" areaRef={setFirst} mono rows={6} value={String(b.text ?? "")} onChange={(v) => ctl.change(E.setBlockField(d, id, "text", v), ck("text"))} />
        </Section>
        <UsesPanel ctl={ctl} b={b} />
      </>
    );
  }

  const [left, right] = p ? ["← Left", "Right →"] : ["↑ Up", "↓ Down"];
  return (
    <>
      {form}
      {b.type !== "intentions" && <BranchesSection ctl={ctl} b={b} />}
      {b.type !== "intentions" && <WhenSection ctl={ctl} b={b} />}
      <Section title={b.type === "function" ? "Shelf" : "Position"}>
        <div className="insp-buttons">
          {/* A greyed-out move says why on hover. */}
          <Btn disabled={!wf.canMove(id, -1)} title={wf.canMove(id, -1) ? "Move it earlier in the flow" : "Already first: nothing to move past"} onClick={() => ctl.move(id, -1)}>
            {left}
          </Btn>
          <Btn disabled={!wf.canMove(id, 1)} title={wf.canMove(id, 1) ? "Move it later in the flow" : "Already last: nothing to move past"} onClick={() => ctl.move(id, 1)}>
            {right}
          </Btn>
        </div>
        {(p || lp) && (
          <div className="insp-buttons">
            {p && <Btn onClick={() => ctl.setFocus({ kind: "par", id: p.id })}>Edit group</Btn>}
            {lp && <Btn onClick={() => ctl.setFocus({ kind: "loop", id: lp.id })}>Edit loop</Btn>}
          </div>
        )}
      </Section>
      <DangerZone label={b.type === "stage" ? "Delete stage" : b.type === "function" ? "Delete function" : "Delete block"} onClick={() => ctl.remove(id)} />
    </>
  );
}

/** How a caller reads in the "Used by" list: its name and what kind of block it is. */
function callerLabel(ctl: StagesController, u: Block): [string, string] {
  if (u.type === "stage") return [String(u.name ?? "") || "Untitled stage", "Stage " + (ctl.scene.nums[u.id] ?? "").toUpperCase()];
  if (u.type === "function") return [String(u.name ?? "") || u.id, "Function"];
  const words = String(u.text ?? "").replace(/\s+/g, " ").trim();
  return [words ? (words.length > 40 ? words.slice(0, 40).trimEnd() + "…" : words) : "Prompt block", "Prompt"];
}

function FunctionForm({ ctl, b, setFirst }: { ctl: StagesController; b: Block; setFirst: SetFirst }) {
  const { wf } = ctl.scene;
  const d = ctl.workflow;
  const id = b.id;
  const name = String(b.name ?? "");
  const params = (Array.isArray(b.params) ? b.params : []) as string[];
  const example = `[[${name || "Name"}${params.length ? ": " + params.map((x) => `${x} = …`).join(", ") : ""}]]`;
  const problems = wf.callProblems().filter((x) => x.includes(pyRepr(name)) || x.includes(id) || x.includes(`'${name}'`));
  const users = wf.callers(name);
  const blank = params[0] ?? "take";
  return (
    <>
      <Section>
        <Field label="Name" hint="Plain words, e.g. Critique">
          {(fid) => <DraftInput id={fid} label="Function name" inputRef={setFirst} value={name} accept={E.fnNameOk} onChange={(v) => ctl.change(E.setBlockField(d, id, "name", v), `${id}:name`)} />}
        </Field>
        <Field label="Fill-ins" hint="What each caller fills in, comma-separated">
          {(fid) => <DraftInput id={fid} label="Fill-ins" placeholder="e.g. take, concept" value={params.join(", ")} onChange={(v) => ctl.change(E.setParams(d, id, v), `${id}:params`)} />}
        </Field>
        <Field label="Instructions" hint={<>Write <code>{`{{${blank}}}`}</code> where a caller&apos;s value goes</>}>
          {(fid) => <TextArea id={fid} label="Instructions" mono rows={6} value={String(b.text ?? "")} onChange={(v) => ctl.change(E.setBlockField(d, id, "text", v), `${id}:text`)} />}
        </Field>
        <ModelField value={b.model} hint="Every use runs on this model" onChange={(v) => ctl.change(E.setModel(d, { block: id }, v))} />
        <More summary="How functions work">
          <p>Not a step: it sits on the Functions shelf and is written once in the prompt. Use it from any stage or prompt block by writing</p>
          <code className="insp-code">{example}</code>
          <p>Every use runs on the chosen model (&ldquo;Follow {name || "Critique"} …, on the opus model&rdquo;).</p>
        </More>
      </Section>
      {problems.length > 0 && (
        <ul className="insp-problems">
          {problems.map((x) => (
            <li key={x}>⚠ {x}</li>
          ))}
        </ul>
      )}
      <Section title={users.length ? `Used by · ${users.length}` : "Used by"}>
        {users.length === 0 ? (
          <p className="insp-hint">Not used yet. Write {example} in a stage, or pick it from a stage&apos;s functions.</p>
        ) : (
          <ul className="insp-users">
            {users.map((u) => (
              <UserRow key={u.id} ctl={ctl} u={u} fnId={id} />
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

/** One caller in the "Used by" list: its name (opens it), its kind, and what each of its calls
 *  fills in, clamped to two lines per value until expanded. */
function UserRow({ ctl, u, fnId }: { ctl: StagesController; u: Block; fnId: string }) {
  const [open, setOpen] = useState(false);
  const [label, kind] = callerLabel(ctl, u);
  const calls = ctl.scene.wf.uses(u).filter(([f]) => f?.id === fnId);
  const long = calls.some(([, , args]) => [...args.values()].some((v) => v.length > 70));
  return (
    <li className="insp-user">
      <div className="insp-user-head">
        <button type="button" className="insp-link" onClick={() => jump(ctl, u.id)} title={`Open ${label}`}>
          {label}
        </button>
        <span className="insp-user-kind">{kind}</span>
      </div>
      {calls.map(([, , args], k) =>
        args.size ? (
          <dl key={k} className="insp-user-args" data-open={open || undefined}>
            {[...args].map(([a, v]) => (
              <div key={a} className="insp-arg">
                <dt title={a}>{a}</dt>
                <dd title={v || undefined}>{v || "—"}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p key={k} className="insp-hint">
            No fill-ins
          </p>
        ),
      )}
      {long && (
        <button type="button" className="insp-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Show all"}
        </button>
      )}
    </li>
  );
}

/** One card per [[call]] in a stage / note: a box per blank and a live "Worker gets:" preview. */
function UsesPanel({ ctl, b }: { ctl: StagesController; b: Block }) {
  const { wf } = ctl.scene;
  const fns = wf.functions();
  const uses = wf.uses(b);
  const [pick, setPick] = useState("");
  if (!uses.length && !fns.size) return null;
  return (
    <Section title="Functions">
      {uses.length > 0 && <Help small>Fill each blank. The preview shows what the worker gets.</Help>}
      {uses.map(([fn, written, args], k) => (
        <section key={k} className="insp-use" data-unknown={!fn || undefined} aria-label={`Function ${fn ? String(fn.name) : written}`}>
          <header className="insp-use-head">
            <span className="insp-use-name">
              ƒ {fn ? String(fn.name) : written}
              {fn && STAGE_MODELS.includes(fn.model as never) && <span className="insp-use-tag">{String(fn.model)}</span>}
              {!fn && <span className="insp-use-tag">unknown</span>}
            </span>
            {fn && (
              <Btn ghost onClick={() => jump(ctl, fn.id)}>
                Open
              </Btn>
            )}
          </header>
          {!fn ? (
            <p className="insp-hint">No function block has this name. Check the spelling, or add one.</p>
          ) : (
            <>
              {((fn.params as string[]) ?? []).map((param) => (
                <label key={param} className="insp-param-row">
                  <span className="insp-param">{param}</span>
                  <DraftInput value={args.get(param) ?? ""} onChange={(v) => ctl.change(E.setCallArg(ctl.workflow, b.id, k, param, v), `${b.id}:use${k}:${param}`)} />
                </label>
              ))}
              <div className="insp-preview-wrap">
                <span className="insp-preview-label">Worker gets</span>
                <p className="insp-preview">
                  {filled(fn, args, fns).map(([text, isValue], i) => (isValue ? <strong key={i}>{text}</strong> : <span key={i}>{text}</span>))}
                </p>
              </div>
            </>
          )}
        </section>
      ))}
      {fns.size > 0 && (
        <select
          className="field insp-use-pick"
          aria-label="Use a function"
          value={pick}
          onChange={(e) => {
            const f = [...fns.values()].find((x) => x.id === e.target.value);
            setPick("");
            if (f) ctl.change(E.appendUse(ctl.workflow, b.id, f.id));
          }}
        >
          <option value="">+ Use a function…</option>
          {[...fns.values()].map((f) => (
            <option key={f.id} value={f.id}>
              {String(f.name)}
            </option>
          ))}
        </select>
      )}
    </Section>
  );
}

function LoopForm({ ctl, l, setFirst }: { ctl: StagesController; l: Loop; setFirst: SetFirst }) {
  const { wf } = ctl.scene;
  const d = ctl.workflow;
  const parent = wf.parentLoop(l);
  const digits = (v: string) => digitsOk(v, 3);
  return (
    <>
      <Section>
        {parent && <Help small>Nested in the loop over {wf.loopSpan(parent)}: runs again in full on every pass of it.</Help>}
        <div className="insp-field">
          <Check label="Agentic loop" checked={!!l.agentic} onChange={(v) => ctl.change(E.setLoopField(d, l.id, "agentic", v))} />
          <p className="insp-hint insp-hint--check">{l.agentic ? "Runs on its own until the count or target is reached." : "Off: pauses after each pass and asks you whether to go again."}</p>
        </div>
      </Section>
      {l.agentic && (
        <Section title="Stop condition">
          <Radios
            name={`mode-${l.id}`}
            label="Stop condition"
            value={l.mode === "reward" ? "reward" : "count"}
            options={[
              ["count", "Fixed passes"],
              ["reward", "Reward function"],
            ]}
            onChange={(v) => ctl.change(E.setLoopField(d, l.id, "mode", v))}
          />
          {l.mode !== "reward" ? (
            <Field label="Passes" inline>
              {(fid) => <DraftInput id={fid} inputRef={setFirst} className="field--num" inputMode="numeric" value={fmtAny(l.count)} accept={digits} onChange={(v) => ctl.change(E.setLoopNumber(d, l.id, "count", v), `${l.id}:count`)} />}
            </Field>
          ) : (
            <>
              <Field label="Reward function" hint="Sent to the agent as text">
                {(fid) => <TextArea id={fid} label="Reward function" areaRef={setFirst} rows={5} value={String(l.reward ?? "")} onChange={(v) => ctl.change(E.setLoopField(d, l.id, "reward", v), `${l.id}:reward`)} />}
              </Field>
              <Field label="Metric">
                {(fid) => <DraftInput id={fid} value={String(l.metric ?? "")} onChange={(v) => ctl.change(E.setLoopField(d, l.id, "metric", v), `${l.id}:metric`)} />}
              </Field>
              <div className="insp-pair">
                <Field label="Target ≥">
                  {(fid) => <DraftInput id={fid} className="field--num" inputMode="decimal" value={fmtAny(l.target)} accept={E.targetOk} onChange={(v) => ctl.change(E.setLoopNumber(d, l.id, "target", v), `${l.id}:target`)} />}
                </Field>
                <Field label="Max passes">
                  {(fid) => <DraftInput id={fid} className="field--num" inputMode="numeric" value={fmtAny(l.max_passes)} accept={digits} onChange={(v) => ctl.change(E.setLoopNumber(d, l.id, "max_passes", v), `${l.id}:max_passes`)} />}
                </Field>
              </div>
              <Help small>Stops at max passes even if the target isn&apos;t reached, and reports the best score.</Help>
            </>
          )}
        </Section>
      )}
      {parent && (
        <Section title="Actions">
          <div className="insp-buttons">
            <Btn onClick={() => ctl.setFocus({ kind: "loop", id: parent.id })}>Edit outer loop</Btn>
          </div>
        </Section>
      )}
      <DangerZone label="Remove loop" onClick={() => ctl.removeLoop(l.id)} />
    </>
  );
}

function ParForm({ ctl, p, onAddBranch }: { ctl: StagesController; p: Parallel; onAddBranch: InspectorProps["onAddBranch"] }) {
  const { wf, nums } = ctl.scene;
  return (
    <>
      <Section title="Branches">
        <Help small>Each branch runs in its own worker at the same time.</Help>
        <ol className="insp-branches">
          {p.blocks.map((id) => (
            <li key={id}>
              <span className="insp-branch-num">{(nums[id] ?? "").toUpperCase()}</span>
              <button type="button" className="insp-link" onClick={() => jump(ctl, id)}>
                {String(wf.block(id)?.name || "Untitled stage")}
              </button>
            </li>
          ))}
        </ol>
        <div className="insp-buttons">
          <button type="button" className="btn btn--sm" onClick={(e) => onAddBranch(e.currentTarget, p.id)}>
            + Branch
          </button>
        </div>
      </Section>
      <Section title="Continue when">
        <Radios
          name={`join-${p.id}`}
          label="Continue when"
          column
          value={p.join === "first" ? "first" : "all"}
          options={[
            ["all", "All branches finish"],
            ["first", "The first one finishes (stop the rest)"],
          ]}
          onChange={(v) => ctl.change(E.setJoin(ctl.workflow, p.id, v))}
        />
      </Section>
      <Section title="Actions">
        <div className="insp-buttons">
          <Btn onClick={() => ctl.ungroup(p.id)}>Ungroup</Btn>
        </div>
      </Section>
    </>
  );
}

function OnCancelForm({ ctl, setFirst }: { ctl: StagesController; setFirst: SetFirst }) {
  const oc = ctl.workflow.on_cancel;
  return (
    <Section>
      <Help small>Each cancel stage is a card in the lane below the flow. Keep each one short.</Help>
      <Field label="Give up after" hint="Minutes to wait for the cancel stages" inline>
        {(fid) => (
          <span className="insp-unit">
            <DraftInput id={fid} inputRef={setFirst} className="field--num" inputMode="numeric" label="Give up after (minutes)" value={String(oc.grace_minutes)} accept={(v) => v === "" || /^\d+$/.test(v)} onChange={(v) => ctl.change(E.setGrace(ctl.workflow, v), "grace")} />
            <span>min</span>
          </span>
        )}
      </Field>
      <div className="insp-buttons">
        <Btn primary onClick={ctl.addCancelStage}>
          + Add cancel stage
        </Btn>
      </div>
    </Section>
  );
}

function CancelForm({ ctl, i, setFirst }: { ctl: StagesController; i: number; setFirst: SetFirst }) {
  const d = ctl.workflow;
  const st = d.on_cancel.stages[i];
  if (!st) return null;
  const n = d.on_cancel.stages.length;
  return (
    <>
      <Section>
        <div className="insp-name-row">
          <Field label="Name">
            {(fid) => <DraftInput id={fid} label="Stage name" inputRef={setFirst} placeholder={NAME_HINT} value={st.name} onChange={(v) => ctl.change(E.setCancelField(d, i, "name", v), `cancel${i}:name`)} />}
          </Field>
          <ModelField value={st.model} onChange={(v) => ctl.change(E.setModel(d, { cancel: i }, v))} />
        </div>
        <PromptField label="Prompt description" title={`Cancel stage ${i + 1} · ${st.name.trim() || UNTITLED}`} placeholder="What should the agent do to wind down? Keep it short." value={st.prompt} onChange={(v) => ctl.change(E.setCancelField(d, i, "prompt", v), `cancel${i}:prompt`)} />
      </Section>
      <Section title="Order">
        <div className="insp-buttons">
          <Btn disabled={i <= 0} onClick={() => ctl.moveCancel(i, -1)} title="Run earlier">
            ← Earlier
          </Btn>
          <Btn disabled={i >= n - 1} onClick={() => ctl.moveCancel(i, 1)} title="Run later">
            Later →
          </Btn>
        </div>
      </Section>
      <DangerZone label="Remove cancel stage" onClick={() => ctl.remove(`cancel:${i}`)} />
    </>
  );
}

/** Drag the panel's left edge to resize it (the Python app's rail drag handle); saved in the config. */
function ResizeHandle({ width, onWidth }: { width: number; onWidth: (w: number) => void }) {
  const start = useRef<{ x: number; w: number } | null>(null);
  return (
    <div
      className="insp-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize inspector"
      aria-valuenow={clampWidth(width)}
      aria-valuemin={DOCK_MIN}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          onWidth(clampWidth(clampWidth(width) + (e.key === "ArrowLeft" ? 20 : -20)));
        }
      }}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, w: clampWidth(width) };
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic pointer */
        }
      }}
      onPointerMove={(e) => {
        if (start.current) onWidth(clampWidth(start.current.w - (e.clientX - start.current.x)));
      }}
      onPointerUp={() => {
        start.current = null;
      }}
    />
  );
}
