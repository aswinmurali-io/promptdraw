// Every edit the stage editor makes, as pure functions WorkflowDict -> WorkflowDict. Each one
// mirrors a StageBuilder callback in the Python app's stage_builder.py (insert, remove, _move, _drop,
// _set, _num, _set_model, _reset_template, the inspector entries, ...) so the compiled prompt
// changes exactly as it does in the Tk app. Nothing here touches the DOM.
// @lat: [[stages#Edits]]
import {
  PyFloat,
  STAGE_MODELS,
  cleanFlags,
  parseCond,
  pyStrip,
  TEMPLATES,
  Workflow,
  blockSettings,
  hasKey,
  oneOf,
  pyRstrip,
  setUse,
  slug,
  useText,
  type AnyState,
  type Block,
  type BlockKind,
  type FlagDef,
  type Focus,
  type Loop,
  type WorkflowDict,
} from "../../core";

/** What the inspector shows (the Python app `self.focus`). `null` = nothing, the settings panel shows. */
export type StageFocus =
  | { kind: "goal" }
  | { kind: "block"; id: string }
  | { kind: "loop"; id: string }
  | { kind: "par"; id: string }
  | { kind: "oncancel" }
  | { kind: "cancel"; i: number };

/** Focus plus the ticked / shift-clicked blocks (the Python app `self.sel`). */
export interface StageSelection {
  focus: StageFocus | null;
  sel: string[];
}

export const NO_SELECTION: StageSelection = { focus: null, sel: [] };

/** Run `fn` on a live Workflow built from `dict`, then sync (StageBuilder.refresh) and dump it. */
export function mutate<R>(dict: WorkflowDict, fn: (wf: Workflow) => R): { wf: WorkflowDict; result: R } {
  const wf = new Workflow(dict);
  const result = fn(wf);
  wf.sync();
  return { wf: wf.toDict(), result };
}

function withBlock(dict: WorkflowDict, id: string, fn: (b: Block, wf: Workflow) => void): WorkflowDict {
  return mutate(dict, (wf) => {
    const b = wf.block(id);
    if (b) fn(b, wf);
  }).wf;
}

/** The focus that insertAfter understands (goal / on-cancel focus adds at the end). */
export function coreFocus(f: StageFocus | null): Focus {
  if (!f) return null;
  if (f.kind === "block" || f.kind === "loop" || f.kind === "par") return [f.kind, f.id];
  return null;
}

/** Drop focus / selection that no longer exist (after an undo, a delete or a reload). */
export function pruneSelection(dict: WorkflowDict, s: StageSelection): StageSelection {
  const wf = new Workflow(dict);
  const sel = s.sel.filter((id) => wf.block(id));
  const f = s.focus;
  let focus: StageFocus | null = f;
  if (f?.kind === "block" && !wf.block(f.id)) focus = null;
  else if (f?.kind === "loop" && !wf.loop(f.id)) focus = null;
  else if (f?.kind === "par" && !wf.par(f.id)) focus = null;
  else if (f?.kind === "cancel" && !(f.i >= 0 && f.i < wf.on_cancel.stages.length)) focus = null;
  if (focus === f && sel.length === s.sel.length) return s;
  return { focus, sel };
}

// ------------------------------------------------------------------ structure

export interface InsertSpot {
  /** Gap "+" button: insert at block index `at`, inside `loop`. */
  at?: number;
  loop?: string | null;
  /** "+ branch" tile / + Branch button: add a branch to this parallel group. */
  par?: string;
  /** Toolbar "+ Add": after the focused block / group / loop, else at the end. */
  after?: StageFocus | null;
}

/**
 * StageBuilder.insert: add a block and select + focus it. A new Intentions block starts from
 * the Task tab's current toggles and settings (`block_settings(app.state())`).
 */
export function insertBlock(
  dict: WorkflowDict,
  spot: InsertSpot,
  kind: BlockKind,
  template: string | null,
  taskState: AnyState,
): { wf: WorkflowDict; id: string } {
  const { wf, result } = mutate(dict, (w) => {
    const had = w.intentions();
    let id: string;
    if (spot.par && w.par(spot.par)) id = w.addBranch(spot.par, template);
    else if (spot.at !== undefined) id = w.insert(spot.at, kind, spot.loop ?? null, template);
    else id = w.insertAfter(coreFocus(spot.after ?? null), kind, template);
    const b = w.block(id);
    if (b && b.type === "intentions" && b !== had) Object.assign(b, blockSettings(taskState));
    return id;
  });
  return { wf, id: result };
}

export function removeBlock(dict: WorkflowDict, id: string): WorkflowDict {
  return mutate(dict, (wf) => wf.remove(id)).wf;
}

export function moveBlock(dict: WorkflowDict, id: string, d: number): WorkflowDict {
  return mutate(dict, (wf) => wf.move(id, d)).wf;
}

export function canMove(dict: WorkflowDict, id: string, d: number): boolean {
  return new Workflow(dict).canMove(id, d);
}

/** StageBuilder._drop: onto a gap (index + loop) or a parallel frame. `ok` is false when refused. */
export function dropBlock(
  dict: WorkflowDict,
  id: string,
  target: { kind: "link"; at: number; loop: string | null } | { kind: "branch"; par: string },
): { wf: WorkflowDict; ok: boolean } {
  const { wf, result } = mutate(dict, (w) => (target.kind === "branch" ? w.moveTo(id, 0, null, target.par) : w.moveTo(id, target.at, target.loop)));
  return { wf, ok: result };
}

/** Selected block ids that still exist, in flow order (StageBuilder._sel_ids). */
export function selIds(dict: WorkflowDict, sel: string[]): string[] {
  const wf = new Workflow(dict);
  return sel.filter((b) => wf.block(b)).sort((a, b) => wf.idx(a) - wf.idx(b));
}

export function groupChecks(dict: WorkflowDict, sel: string[]): { loop: [boolean, string]; par: [boolean, string]; ids: string[] } {
  const wf = new Workflow(dict);
  const ids = selIds(dict, sel);
  return { loop: wf.loopCheck(ids), par: wf.parCheck(ids), ids };
}

/** What the selected blocks are called: "stage", "prompt block", … or plain "block" when mixed. */
function selNoun(dict: WorkflowDict, ids: string[]): string {
  const wf = new Workflow(dict);
  const kinds = new Set(ids.map((id) => wf.block(id)?.type));
  const kind = kinds.size === 1 ? [...kinds][0] : undefined;
  const noun = kind === "stage" ? "stage" : kind === "prompt" ? "prompt block" : kind === "function" ? "function" : "block";
  return ids.length === 1 ? noun : noun + "s";
}

/**
 * The status line under the canvas (StageBuilder._update_tools): what is selected, and what
 * the selection can become (with the key that does it), or why it can't.
 */
/** The status line with nothing ticked: how to work the canvas. Shown only while the flow is
 *  short (see StagesMount); the same gestures are listed under Help. */
export const IDLE_HINT = "Click a block to edit it · Shift+click to group blocks · drag to pan";

export function selectionHint(dict: WorkflowDict, sel: string[]): string {
  const { loop, par, ids } = groupChecks(dict, sel);
  if (!ids.length) return IDLE_HINT;
  const what = `${ids.length} ${selNoun(dict, ids)} selected`;
  if (loop[0] || par[0]) {
    const can = [
      ["L to loop", loop[0]],
      ["G to run in parallel", par[0]],
    ]
      .filter(([, ok]) => ok)
      .map(([w]) => w);
    const more = ids.length === 1 ? " · tick another to run them in parallel" : "";
    return `${what} · press ${can.join(" or ")}${par[0] ? "" : more}`;
  }
  return `${what} · ${ids.length > 1 ? par[1] : loop[1]}`;
}

export function makeLoop(dict: WorkflowDict, sel: string[]): { wf: WorkflowDict; id: string | null } {
  const ids = selIds(dict, sel);
  const { wf, result } = mutate(dict, (w) => w.makeLoop(ids));
  return { wf, id: result };
}

export function makePar(dict: WorkflowDict, sel: string[]): { wf: WorkflowDict; id: string | null } {
  const ids = selIds(dict, sel);
  const { wf, result } = mutate(dict, (w) => w.makePar(ids));
  return { wf, id: result };
}

/** Remove loop: focus moves to its first block (StageBuilder._remove_loop). */
export function removeLoop(dict: WorkflowDict, lid: string): { wf: WorkflowDict; first: string | null } {
  const { wf, result } = mutate(dict, (w) => {
    const first = w.loop(lid)?.blocks[0] ?? null;
    w.removeLoop(lid);
    return first;
  });
  return { wf, first: result };
}

/** Ungroup: focus moves to its first branch (StageBuilder._ungroup). */
export function ungroup(dict: WorkflowDict, pid: string): { wf: WorkflowDict; first: string | null } {
  const { wf, result } = mutate(dict, (w) => {
    const first = w.par(pid)?.blocks[0] ?? null;
    w.ungroup(pid);
    return first;
  });
  return { wf, first: result };
}

// ------------------------------------------------------------------ fields

export function setGoal(dict: WorkflowDict, goal: string): WorkflowDict {
  return { ...dict, goal };
}

/** The WORKFLOW name entry: stored slugified (the Python app `_on_name`). */
export function setName(dict: WorkflowDict, raw: string): WorkflowDict {
  return { ...dict, name: slug(raw) };
}

/** Plain field writes: stage name / prompt, note text, function text, read_only. */
export function setBlockField(dict: WorkflowDict, id: string, key: "name" | "prompt" | "text" | "read_only", value: string | boolean): WorkflowDict {
  return withBlock(dict, id, (b) => {
    b[key] = value;
  });
}

/** A block's "Show when" condition (flags.ts): blank removes it. Intentions blocks take none. */
export function setBlockWhen(dict: WorkflowDict, id: string, when: string): WorkflowDict {
  return withBlock(dict, id, (b) => {
    if (b.type === "intentions") return;
    const v = pyStrip(when);
    if (v) b.when = v;
    else delete b.when;
  });
}

/** Why a "Show when" text cannot be used, or null: it must read as `flag`, `!flag`, `flag == x` or `flag != x`
 *  and name a flag the workflow declares. Blank is fine (the block always shows). */
export function whenProblem(dict: WorkflowDict, raw: string): string | null {
  const v = pyStrip(raw);
  if (!v) return null;
  let name: string;
  try {
    name = parseCond(v, "Show when").name;
  } catch (e) {
    return (e as Error).message.replace(/^Show when: /, "");
  }
  return (dict.flags ?? []).some((f) => f.name === name) ? null : `No flag named ${name}. Declare it under Prompt flags on the Goal.`;
}

/** The flags a workflow declares, replaced whole (none removes the key, so a flagless workflow serialises as before). */
export function setFlagDefs(dict: WorkflowDict, flags: FlagDef[]): WorkflowDict {
  const next: WorkflowDict = { ...dict };
  const clean = cleanFlags(flags);
  if (clean.length) next.flags = clean;
  else delete next.flags;
  return next;
}

/** A flag name nothing declares yet: flag_a, flag_b … */
export function freeFlagName(dict: WorkflowDict): string {
  const taken = new Set((dict.flags ?? []).map((f) => f.name));
  for (let i = 0; ; i++) {
    const name = "flag_" + (i < 26 ? String.fromCharCode(97 + i) : String(i + 1));
    if (!taken.has(name)) return name;
  }
}

export function addFlag(dict: WorkflowDict): WorkflowDict {
  return setFlagDefs(dict, [...(dict.flags ?? []), { name: freeFlagName(dict), type: "bool", default: false }]);
}

export function removeFlag(dict: WorkflowDict, name: string): WorkflowDict {
  return setFlagDefs(dict, (dict.flags ?? []).filter((f) => f.name !== name));
}

/** Change one flag. A new name that is not a lower-case word, or is taken, changes nothing; a type change resets the default. */
export function updateFlag(dict: WorkflowDict, name: string, patch: Partial<Pick<FlagDef, "name" | "type" | "default" | "label">>): WorkflowDict {
  const defs = dict.flags ?? [];
  const at = defs.findIndex((f) => f.name === name);
  if (at < 0) return dict;
  const cur = defs[at] as FlagDef;
  const next: FlagDef = { ...cur, ...patch };
  if (patch.type && patch.type !== cur.type) next.default = patch.type === "text" ? "" : false;
  if (patch.label !== undefined && !pyStrip(patch.label)) delete next.label;
  if (patch.name !== undefined && (!/^[a-z][a-z0-9_]*$/.test(patch.name) || defs.some((f, i) => i !== at && f.name === patch.name))) return dict;
  return setFlagDefs(dict, defs.map((f, i) => (i === at ? next : f)));
}

/** The Python app's function-name validator: blank, or at most 40 letters, digits, spaces, - and _. */
export function fnNameOk(v: string): boolean {
  return v === "" || (Array.from(v).length <= 40 && /^[\p{L}\p{N} _-]*$/u.test(v));
}

/** Params entry: comma-separated, each stripped, blanks dropped. */
export function parseParams(raw: string): string[] {
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function setParams(dict: WorkflowDict, id: string, raw: string): WorkflowDict {
  return withBlock(dict, id, (b) => {
    b.params = parseParams(raw);
  });
}

/** _set_model: a known model sets the hint, "none" removes it. For blocks or cancel stages. */
export function setModel(dict: WorkflowDict, target: { block: string } | { cancel: number }, value: string): WorkflowDict {
  return mutate(dict, (wf) => {
    const obj = ("block" in target ? wf.block(target.block) : wf.on_cancel.stages[target.cancel]) as Record<string, unknown> | null | undefined;
    if (!obj) return;
    if (oneOf(STAGE_MODELS, value)) obj.model = value;
    else delete obj.model;
  }).wf;
}

export function templateEdited(b: Block): boolean | null {
  if (!hasKey(TEMPLATES, b.template)) return null;
  const t = TEMPLATES[b.template];
  return b.name !== t.name || b.prompt !== t.prompt;
}

export function resetTemplate(dict: WorkflowDict, id: string): WorkflowDict {
  return withBlock(dict, id, (b) => {
    if (!hasKey(TEMPLATES, b.template)) return;
    const t = TEMPLATES[b.template];
    b.name = t.name;
    b.prompt = t.prompt;
  });
}

/** Intentions inspector: every edit rewrites the block through block_settings (intention_vars). */
export function setIntentions(dict: WorkflowDict, id: string, values: AnyState): WorkflowDict {
  return withBlock(dict, id, (b) => {
    Object.assign(b, blockSettings(values));
  });
}

/** Uses panel: fill blank `param` of the k-th call in the block's text (set_use). */
export function setCallArg(dict: WorkflowDict, id: string, k: number, param: string, value: string): WorkflowDict {
  return withBlock(dict, id, (b, wf) => {
    const key = b.type === "stage" ? "prompt" : "text";
    const use = wf.uses(b)[k];
    if (!use || !use[0]) return;
    const [fn, , args] = use;
    args.set(param, value.trim());
    b[key] = setUse(String(b[key] ?? ""), k, fn, args);
  });
}

/** "+ Use a function…": append `[[Name: p = , …]]` on its own line. */
export function appendUse(dict: WorkflowDict, id: string, fnId: string): WorkflowDict {
  return withBlock(dict, id, (b, wf) => {
    const fn = wf.block(fnId);
    if (!fn) return;
    const key = b.type === "stage" ? "prompt" : "text";
    const text = pyRstrip(String(b[key] ?? ""));
    const params = (Array.isArray(fn.params) ? fn.params : []) as string[];
    b[key] = (text ? text + "\n" : "") + useText(fn, Object.fromEntries(params.map((p) => [p, ""])));
  });
}

// ------------------------------------------------------------------ loops & groups

function withLoop(dict: WorkflowDict, lid: string, fn: (l: Loop) => void): WorkflowDict {
  return mutate(dict, (wf) => {
    const l = wf.loop(lid);
    if (l) fn(l);
  }).wf;
}

export function setLoopField(dict: WorkflowDict, lid: string, key: "agentic" | "mode" | "reward" | "metric", value: string | boolean): WorkflowDict {
  return withLoop(dict, lid, (l) => {
    (l as unknown as Record<string, unknown>)[key] = key === "metric" && typeof value === "string" ? value.trim() : value;
  });
}

/** The Python app `_num`: ints for count / max_passes, a float for target; ignored unless > 0 (target ≥ 0). */
export function setLoopNumber(dict: WorkflowDict, lid: string, key: "count" | "max_passes" | "target", text: string): WorkflowDict {
  const s = text.trim();
  if (key === "target") {
    if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return dict;
    const v = Number(s);
    if (!(v >= 0)) return dict;
    return withLoop(dict, lid, (l) => {
      (l as unknown as Record<string, unknown>).target = new PyFloat(v);
    });
  }
  if (!/^\d+$/.test(s)) return dict;
  const v = Number(s);
  if (!(v > 0)) return dict;
  return withLoop(dict, lid, (l) => {
    l[key] = v;
  });
}

/** Loop inspector digit entries (count / max passes: ≤ 3 digits; target: ≤ 8 chars of a decimal). */
export function targetOk(v: string): boolean {
  return v === "" || (v.length <= 8 && /^\d*\.?\d*$/.test(v) && /\d/.test(v));
}

export function setJoin(dict: WorkflowDict, pid: string, join: "all" | "first"): WorkflowDict {
  return mutate(dict, (wf) => {
    const p = wf.par(pid);
    if (p) p.join = join;
  }).wf;
}

// ------------------------------------------------------------------ on cancel

export function addCancelStage(dict: WorkflowDict): { wf: WorkflowDict; i: number } {
  const { wf, result } = mutate(dict, (w) => w.addCancelStage());
  return { wf, i: result };
}

export function removeCancelStage(dict: WorkflowDict, i: number): WorkflowDict {
  return mutate(dict, (wf) => wf.removeCancelStage(i)).wf;
}

export function moveCancelStage(dict: WorkflowDict, i: number, d: number): { wf: WorkflowDict; i: number } {
  const { wf, result } = mutate(dict, (w) => w.moveCancelStage(i, d));
  return { wf, i: result };
}

export function setCancelField(dict: WorkflowDict, i: number, key: "name" | "prompt", value: string): WorkflowDict {
  return mutate(dict, (wf) => {
    const st = wf.on_cancel.stages[i];
    if (st) st[key] = value;
  }).wf;
}

/** "Give up after (minutes)": digits only, stored when > 0. */
export function setGrace(dict: WorkflowDict, text: string): WorkflowDict {
  const s = text.trim();
  if (!/^\d+$/.test(s) || Number(s) <= 0) return dict;
  return mutate(dict, (wf) => {
    wf.on_cancel.grace_minutes = Number(s);
  }).wf;
}
