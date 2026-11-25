// Port of the Python app's workflow.py (model, grouping rules, functions, prompt section).
// YAML in/out lives in yaml.ts. Pure: no DOM, no I/O.
//
// Rules:
// - Blocks form one ordered list. Parallel groups and loops cover consecutive blocks.
// - A parallel group holds 2+ stages; a group left with one branch dissolves.
// - At most one intentions block; it adds no step.
// - Function blocks are reusable text with {{blanks}}, used with [[Name: blank = value]];
//   they sit outside the flow, parallel groups and loops.
// - A workflow can pin workspace settings (branch, worktree, commit, base).
// - A loop wraps whole units; loops nest (disjoint or strictly inside), never cut across.
// @lat: [[core#Modules]]
import {
  FUNCTIONS_HEAD,
  JOINS,
  LETTERS,
  LOOP_DEFAULTS,
  ON_CANCEL_GRACE,
  ON_CANCEL_HEAD,
  READ_ONLY_NOTE,
  STAGE_MODELS,
  TEMPLATES,
  WORKSPACE,
  hasKey,
  oneOf,
  type StageModel,
  type TemplateKey,
} from "./constants";
import { cleanFlags, flagProblems, type FlagDef } from "./flags";
import { blockSettings, fill } from "./intentions";
import { PY_WS, deepClone, fmtNum, isPlainObject, isPyInt, isPyNumber, pyRepr, pySplit, pyStr, pyStrip, truthy } from "./py";

/** A block as stored: id and type, plus the fields of its kind (stage, prompt, function, intentions). */
export type Block = { id: string; type: string } & Record<string, unknown>;
export interface Parallel {
  id: string;
  blocks: string[];
  join?: unknown;
  [k: string]: unknown;
}
export interface Loop {
  id: string;
  blocks: string[];
  agentic: unknown;
  mode: unknown;
  count: unknown;
  reward: unknown;
  metric: unknown;
  target: unknown;
  max_passes: unknown;
  [k: string]: unknown;
}
export interface Workspace {
  branch?: string;
  worktree?: string;
  commit?: string;
  base?: string;
}
export interface CancelStage {
  name: string;
  prompt: string;
  model?: StageModel;
}
export interface OnCancel {
  grace_minutes: number;
  stages: CancelStage[];
}
export interface WorkflowDict {
  name: string;
  goal: string;
  workspace: Workspace;
  on_cancel: OnCancel;
  /** Declared prompt flags (flags.ts); absent when there are none. */
  flags?: FlagDef[];
  blocks: Block[];
  parallels: Parallel[];
  loops: Loop[];
}
/** A focus target for `insertAfter`: a block, a parallel group or a loop. */
export type Focus = ["block" | "par" | "loop", string] | null;
export type BlockKind = "stage" | "prompt" | "function" | "intentions";
export type Args = Map<string, string>;
export type ArgsLike = Map<string, string> | Record<string, string>;

function get(d: Record<string, unknown>, key: string, def: unknown): unknown {
  return Object.prototype.hasOwnProperty.call(d, key) ? d[key] : def;
}

/** `str(v)` where the Python app assumes text (lenient where Python would crash on a non-string). */
function text(v: unknown): string {
  return typeof v === "string" ? v : v === undefined ? "" : pyStr(v);
}

/** `fmt_num` for a value that may not be a number (then `str(v)`). */
export function fmtAny(v: unknown): string {
  return isPyNumber(v) ? fmtNum(v) : pyStr(v);
}

/** `clean_on_cancel`: whatever came in -> {grace_minutes: int > 0, stages: [{name, prompt, model?}]}. */
export function cleanOnCancel(d: unknown): OnCancel {
  const src = isPlainObject(d) ? d : {};
  const stages: CancelStage[] = [];
  const raw = src.stages;
  for (const s of truthy(raw) && Array.isArray(raw) ? raw : []) {
    if (!isPlainObject(s)) continue;
    const st: CancelStage = { name: pyStr(get(s, "name", "")), prompt: pyStr(get(s, "prompt", "")) };
    if (oneOf(STAGE_MODELS, s.model)) st.model = s.model;
    stages.push(st);
  }
  const g = src.grace_minutes;
  return { grace_minutes: isPyInt(g) && g > 0 ? g : ON_CANCEL_GRACE, stages };
}

const NAME_RE = /^[A-Za-z][A-Za-z0-9 _-]*$/;
// Python `$` also matches before a final "\n".
const PARAM_RE = /^[a-z][a-z0-9_]*\n?$/;
const CALL_SRC = `\\[\\[[${PY_WS}]*([A-Za-z][A-Za-z0-9 _-]*?)[${PY_WS}]*(?::((?:(?!\\]\\])[^\\n])*))?\\]\\]`;
/** `_CALL`: [[Name]] or [[Name: blank = value, …]]. A fresh global regex each call. */
export function callRe(): RegExp {
  return new RegExp(CALL_SRC, "g");
}
const BLANK_SRC = `\\{\\{[${PY_WS}]*([a-z][a-z0-9_]*)[${PY_WS}]*\\}\\}`;
const USED_SRC = `\\{\\{[${PY_WS}]*([a-z_][a-z0-9_]*)[${PY_WS}]*\\}\\}`;

/** `fn_key`: "Take chain", "take_chain" and "TAKE  chain" are one function. */
export function fnKey(name: unknown): string {
  return pySplit(pyStr(name).replace(/_/g, " ").toLowerCase()).join(" ");
}

/** `slug`: workflow name -> safe file stem. */
export function slug(name: unknown): string {
  const s = pyStrip(pyStr(name))
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || "untitled";
}

function nests(a: Set<string>, b: Set<string>): boolean {
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return shared === 0 || (shared === a.size && a.size < b.size) || (shared === b.size && b.size < a.size);
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/** `clean_workspace`: only known keys with allowed values (base: any non-blank text), stripped. */
export function cleanWorkspace(d: unknown): Workspace {
  const src = isPlainObject(d) ? d : {};
  const out: Workspace = {};
  for (const k of Object.keys(WORKSPACE) as (keyof Workspace)[]) {
    const v = src[k];
    const allowed = WORKSPACE[k] as string[] | null;
    if (typeof v === "string" && pyStrip(v) && (allowed === null || allowed.includes(v))) out[k] = pyStrip(v);
  }
  return out;
}

function toArgs(a: ArgsLike): Args {
  return a instanceof Map ? a : new Map(Object.entries(a));
}

/** `parse_args`: `take=A, concept="bold, warm"` -> Map. Commas in quotes or {{fill-ins}} don't split. */
export function parseArgs(src: string): Args {
  const parts: string[] = [];
  let cur = "";
  let depth = 0;
  let quote = false;
  let i = 0;
  while (i < src.length) {
    const ch = src[i] as string;
    if (quote) {
      cur += ch;
      if (ch === "\\" && i + 1 < src.length) {
        cur += src[i + 1];
        i += 1;
      } else if (ch === '"') quote = false;
    } else if (ch === '"') {
      quote = true;
      cur += ch;
    } else if (src.startsWith("{{", i)) {
      depth += 1;
      cur += "{{";
      i += 1;
    } else if (src.startsWith("}}", i) && depth) {
      depth -= 1;
      cur += "}}";
      i += 1;
    } else if (ch === "," && !depth) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
    i += 1;
  }
  parts.push(cur);
  const args: Args = new Map();
  for (const part of parts) {
    const at = part.indexOf("=");
    if (at < 0) continue;
    const key = pyStrip(part.slice(0, at));
    let val = pyStrip(part.slice(at + 1));
    if (!key) continue;
    if (val.length >= 2 && val[0] === '"' && val[val.length - 1] === '"') {
      try {
        const parsed: unknown = JSON.parse(val);
        val = typeof parsed === "string" ? parsed : val.slice(1, -1);
      } catch {
        val = val.slice(1, -1);
      }
    }
    args.set(key, val);
  }
  return args;
}

function params(fn: Record<string, unknown>): string[] {
  const p = fn.params;
  return Array.isArray(p) ? (p as unknown[]).map(text) : [];
}

/** `_arg_out`: quote a value only when it would otherwise split or end the use. */
export function argOut(v: unknown): string {
  const s = pyStr(v);
  return (s.includes(",") && !s.includes("{{")) || s.includes("]]") || s !== pyStrip(s) ? JSON.stringify(s) : s;
}

/** `use_text`: the [[...]] text for using fn with these values, blanks in the function's order. */
export function useText(fn: Record<string, unknown>, argsIn: ArgsLike): string {
  const args = toArgs(argsIn);
  const ps = params(fn);
  const order = [...ps, ...[...args.keys()].filter((k) => !ps.includes(k))];
  const bits = order.map((k) => `${k} = ${argOut(args.get(k) ?? "")}`).join(", ");
  return `[[${pyStrip(text(fn.name))}${bits ? ": " + bits : ""}]]`;
}

/** `set_use`: text with its k-th [[...]] rewritten to use fn with args. */
export function setUse(src: string, k: number, fn: Record<string, unknown>, args: ArgsLike): string {
  const ms = [...src.matchAll(callRe())];
  const m = ms[k];
  if (k < 0 || !m) return src;
  return src.slice(0, m.index) + useText(fn, args) + src.slice(m.index + m[0].length);
}

/**
 * `filled`: what the worker gets for this use, as [text, isValue] runs. Each {{blank}}
 * becomes the caller's value; with fns, uses of other functions read "Follow **Name** (…)".
 */
export function filled(fn: Record<string, unknown>, argsIn: ArgsLike, fns?: Map<string, Block>): [string, boolean][] {
  const args = toArgs(argsIn);
  const ps = params(fn);
  let t = pyStrip(text(get(fn, "text", ""))).replace(new RegExp(BLANK_SRC, "g"), (m0, name: string) =>
    ps.includes(name) ? "\x01" + (args.get(name) || `‹${name} not filled in›`) + "\x02" : m0,
  );
  if (fns) t = renderCalls(t, fns);
  return t
    .split(/(\x01[^\x02]*\x02)/)
    .filter((p) => p)
    .map((p): [string, boolean] => (p.startsWith("\x01") ? [p.slice(1, -1), true] : [p, false]));
}

/** `model_note`: ", on the `m` model" for a function with a model hint. */
export function modelNote(fn: Record<string, unknown>): string {
  return oneOf(STAGE_MODELS, fn.model) ? `, on the \`${fn.model}\` model` : "";
}

/** `render_calls`: each [[Name: blank = value]] -> "Follow **Name** (blank: value)"; unknown names stay. */
export function renderCalls(src: string, fns: Map<string, Block>): string {
  return src.replace(callRe(), (m0, name: string, rawArgs: string | undefined) => {
    const fn = fns.get(fnKey(name));
    if (!fn) return m0;
    const args = parseArgs(rawArgs || "");
    const ps = params(fn);
    const order = [...ps.filter((p) => args.has(p)), ...[...args.keys()].filter((k) => !ps.includes(k))];
    const bits = order.map((k) => `${k}: ${args.get(k)}`).join(", ");
    return `Follow **${pyStrip(text(fn.name))}**${bits ? ` (${bits})` : ""}${modelNote(fn)}`;
  });
}

function blockText(b: Record<string, unknown>): string {
  return text(b.type === "stage" ? get(b, "prompt", "") : get(b, "text", ""));
}

export class Workflow {
  name: string;
  goal: string;
  blocks: Block[];
  parallels: Parallel[];
  loops: Loop[];
  workspace: Workspace;
  on_cancel: OnCancel;
  flags: FlagDef[];

  constructor(dataIn?: unknown) {
    const data: Record<string, unknown> = isPlainObject(dataIn) && truthy(dataIn) ? dataIn : {};
    this.name = slug(get(data, "name", "untitled"));
    this.goal = pyStr(get(data, "goal", ""));
    const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : typeof v === "string" ? Array.from(v) : []);
    this.blocks = arr(get(data, "blocks", [])).map((b) => deepClone(b) as Block);
    this.parallels = arr(get(data, "parallels", [])).map((p) => {
      const src = p as Record<string, unknown>;
      return { ...deepClone(src), blocks: arr(src.blocks).map((x) => x as string) } as Parallel;
    });
    this.loops = arr(get(data, "loops", [])).map((l) => {
      const src = l as Record<string, unknown>;
      return { ...deepClone(LOOP_DEFAULTS), ...deepClone(src), blocks: arr(src.blocks).map((x) => x as string) } as Loop;
    });
    this.workspace = cleanWorkspace(truthy(data.workspace) ? data.workspace : {});
    this.on_cancel = cleanOnCancel(data.on_cancel);
    this.flags = cleanFlags(data.flags);
    this.sync();
  }

  toDict(): WorkflowDict {
    return {
      name: this.name,
      goal: this.goal,
      workspace: { ...this.workspace },
      on_cancel: { grace_minutes: this.on_cancel.grace_minutes, stages: this.on_cancel.stages.map((s) => ({ ...s })) },
      ...(this.flags.length ? { flags: this.flags.map((f) => ({ ...f })) } : {}),
      blocks: this.blocks.map((b) => deepClone(b)),
      parallels: this.parallels.map((p) => deepClone(p)),
      loops: this.loops.map((l) => deepClone(l)),
    };
  }

  /** Problems with the workflow's flags: malformed `{{#if}}`, undeclared flags, flags nothing uses. */
  flagProblems(): string[] {
    return flagProblems(this.toDict());
  }

  // ------------------------------------------------------------ lookups
  ids(): string[] {
    return this.blocks.map((b) => b.id);
  }

  block(bid: string): Block | null {
    return this.blocks.find((b) => b.id === bid) ?? null;
  }

  idx(bid: string): number {
    return this.blocks.findIndex((b) => b.id === bid);
  }

  loop(lid: string | null | undefined): Loop | null {
    return this.loops.find((l) => l.id === lid) ?? null;
  }

  addCancelStage(name = "", prompt = ""): number {
    this.on_cancel.stages.push({ name, prompt });
    return this.on_cancel.stages.length - 1;
  }

  removeCancelStage(i: number): void {
    if (i >= 0 && i < this.on_cancel.stages.length) this.on_cancel.stages.splice(i, 1);
  }

  moveCancelStage(i: number, delta: number): number {
    const stages = this.on_cancel.stages;
    if (!(i >= 0 && i < stages.length)) return i;
    const j = Math.max(0, Math.min(stages.length - 1, i + delta));
    if (j !== i) stages.splice(j, 0, ...stages.splice(i, 1));
    return j;
  }

  /** The workflow's intentions block, if it has one. */
  intentions(): Block | null {
    return this.blocks.find((b) => b.type === "intentions") ?? null;
  }

  /** Function blocks by fn_key (the first one wins if two share a name). */
  functions(): Map<string, Block> {
    const out = new Map<string, Block>();
    for (const b of this.blocks) {
      if (b.type !== "function") continue;
      const k = fnKey(get(b, "name", ""));
      if (k && !out.has(k)) out.set(k, b);
    }
    return out;
  }

  /** Function names a block calls, in order, without repeats. */
  callsIn(b: Block): string[] {
    const out: string[] = [];
    for (const m of blockText(b).matchAll(callRe())) {
      const k = fnKey(m[1]);
      if (!out.includes(k)) out.push(k);
    }
    return out;
  }

  /** Each [[...]] in a block, in order: [fn block or null, name as written, args]. */
  uses(b: Block): [Block | null, string, Args][] {
    const fns = this.functions();
    return [...blockText(b).matchAll(callRe())].map((m) => [
      fns.get(fnKey(m[1])) ?? null,
      m[1] as string,
      parseArgs(m[2] || ""),
    ]);
  }

  /** Blocks (stages, notes, other functions) that use function `name`. */
  callers(name: string): Block[] {
    const k = fnKey(name);
    return this.blocks.filter((b) => b.type !== "intentions" && this.callsIn(b).includes(k));
  }

  /** Human-readable problems with function blocks and the calls to them. */
  callProblems(): string[] {
    const fns = this.functions();
    const out: string[] = [];
    const seen = new Set<string>();
    for (const b of this.blocks) {
      if (b.type !== "function") continue;
      const name = text(get(b, "name", ""));
      if (!NAME_RE.test(pyStrip(name))) {
        out.push(`Function block ${b.id} needs a plain name (letters, digits, spaces), not ${pyRepr(name)}`);
      } else if (seen.has(fnKey(name))) {
        out.push(`Two function blocks are named ${pyRepr(name)}; uses go to the first`);
      }
      seen.add(fnKey(name));
      const ps = params(b);
      for (const p of ps) {
        if (!PARAM_RE.test(p)) out.push(`Function ${pyRepr(name)}: blank ${pyRepr(p)} should be one lower-case word`);
      }
      const used = new Set([...text(get(b, "text", "")).matchAll(new RegExp(USED_SRC, "g"))].map((m) => m[1] as string));
      for (const p of [...used].filter((x) => !ps.includes(x)).sort()) {
        out.push(`Function ${pyRepr(name)} uses {{${p}}} but has no such parameter`);
      }
    }
    const check = (src: string, where: string): void => {
      for (const m of src.matchAll(callRe())) {
        const fn = fns.get(fnKey(m[1]));
        if (!fn) {
          out.push(`${where} uses unknown function ${pyRepr(m[1])}`);
          continue;
        }
        const args = parseArgs(m[2] || "");
        const ps = params(fn);
        const missing = ps.filter((p) => !args.has(p));
        const extra = [...args.keys()].filter((k) => !ps.includes(k));
        if (missing.length) out.push(`${where} uses ${pyRepr(fn.name)} without filling in ${missing.join(", ")}`);
        if (extra.length) out.push(`${where} fills in unknown blank(s) ${extra.join(", ")} for ${pyRepr(fn.name)}`);
      }
    };
    for (const b of this.blocks) {
      const where = b.type === "stage" ? `stage ${pyRepr(truthy(b.name) ? b.name : b.id)}` : "block " + b.id;
      check(blockText(b), where);
    }
    this.on_cancel.stages.forEach((s, i) => {
      const where = `Cancel stage ${i + 1}`;
      if (!pyStrip(s.name)) out.push(`${where} needs a name`);
      if (!pyStrip(s.prompt)) out.push(`${where} needs a prompt`);
      check(s.prompt, where);
    });
    return out;
  }

  par(pid: string | null | undefined): Parallel | null {
    return this.parallels.find((p) => p.id === pid) ?? null;
  }

  /** Every loop holding bid, outermost first. */
  loopsOf(bid: string): Loop[] {
    return this.loops.filter((l) => l.blocks.includes(bid)).sort((a, b) => b.blocks.length - a.blocks.length);
  }

  /** The innermost loop holding bid. */
  loopOf(bid: string): Loop | null {
    const chain = this.loopsOf(bid);
    return chain[chain.length - 1] ?? null;
  }

  /** The loop directly around loop l, if any. */
  parentLoop(l: Loop): Loop | null {
    const s = new Set(l.blocks);
    let best: Loop | null = null;
    for (const o of this.loops) {
      const os = new Set(o.blocks);
      if (s.size < os.size && isSubset(s, os) && (best === null || o.blocks.length < best.blocks.length)) best = o;
    }
    return best;
  }

  /** The outermost loop holding bid that sits inside loop `within` (null: the top level). */
  childLoop(bid: string, within: Loop | null = null): Loop | null {
    let chain = this.loopsOf(bid).map((l) => l.id);
    if (within) {
      const k = chain.indexOf(within.id);
      chain = k >= 0 ? chain.slice(k + 1) : [];
    }
    return chain.length ? this.loop(chain[0]) : null;
  }

  parOf(bid: string): Parallel | null {
    return this.parallels.find((p) => p.blocks.includes(bid)) ?? null;
  }

  /** Split a run of ids into units: a whole loop inside `within` (when outer), a parallel group, or one block. */
  chunks(ids: string[], outer: boolean, within: Loop | null = null): string[][] {
    const out: string[][] = [];
    let i = 0;
    while (i < ids.length) {
      const id = ids[i] as string;
      const group = (outer ? this.childLoop(id, within) : null) ?? this.parOf(id);
      const g = group ? [...group.blocks] : [id];
      out.push(g);
      i += g.length;
    }
    return out;
  }

  nextId(prefix: string): string {
    const taken = [...this.blocks.map((b) => b.id), ...this.loops.map((l) => l.id), ...this.parallels.map((p) => p.id)];
    const nums = taken
      .filter((t) => typeof t === "string" && t.slice(0, 1) === prefix && /^[0-9]+$/.test(t.slice(1)))
      .map((t) => Number(t.slice(1)));
    return prefix + String(Math.max(0, ...nums) + 1);
  }

  // ------------------------------------------------------------ invariants
  /** Repair groups after any edit: known ids only, flow order, contiguous, no empty/1-branch groups. */
  sync(): void {
    const known = new Set(this.ids());
    for (const g of [...this.loops, ...this.parallels]) {
      const seen: string[] = [];
      for (const bid of g.blocks) if (known.has(bid) && !seen.includes(bid)) seen.push(bid);
      g.blocks = seen.sort((a, b) => this.idx(a) - this.idx(b));
    }
    const claimed = new Set<string>();
    const pars: Parallel[] = [];
    for (const p of this.parallels) {
      p.blocks = p.blocks.filter((b) => this.block(b)?.type === "stage" && !claimed.has(b));
      if (p.blocks.length > 1 && this.contiguous(p.blocks)) {
        p.join = oneOf(JOINS, p.join) ? p.join : "all";
        for (const b of p.blocks) claimed.add(b);
        pars.push(p);
      }
    }
    this.parallels = pars;
    for (const l of this.loops) l.blocks = l.blocks.filter((b) => this.block(b)?.type !== "function");
    const loops: Loop[] = [];
    for (const l of this.loops) {
      const s = new Set(l.blocks);
      for (const o of loops) {
        const os = new Set(o.blocks);
        if (!nests(s, os)) for (const x of os) s.delete(x);
      }
      l.blocks = l.blocks.filter((b) => s.has(b));
      const whole = this.parallels.every((p) => {
        const ps = new Set(p.blocks);
        return !p.blocks.some((b) => s.has(b)) || isSubset(ps, s);
      });
      if (s.size && this.contiguous(l.blocks) && whole && loops.every((o) => nests(s, new Set(o.blocks)))) loops.push(l);
    }
    this.loops = loops;
  }

  contiguous(ids: string[]): boolean {
    const ix = ids.map((b) => this.idx(b)).sort((a, b) => a - b);
    return ix.length > 0 && (ix[ix.length - 1] as number) - (ix[0] as number) === ix.length - 1;
  }

  // ------------------------------------------------------------ numbering & text
  /** One number per step; parallel branches share it as 3a, 3b… */
  stageNumbers(): Record<string, string> {
    const nums: Record<string, string> = {};
    let n = 0;
    for (const g of this.chunks(this.ids(), false)) {
      const stages = g.filter((b) => this.block(b)?.type === "stage");
      if (!stages.length) continue;
      n += 1;
      if (g.length > 1) stages.forEach((b, i) => (nums[b] = `${n}${LETTERS[i % LETTERS.length]}`));
      else nums[stages[0] as string] = String(n);
    }
    return nums;
  }

  loopSummary(l: Loop): string {
    if (!truthy(l.agentic)) return "ask me after each pass";
    if (l.mode === "count") return `${pyStr(l.count)} passes`;
    return `until ${truthy(l.metric) ? pyStr(l.metric) : "metric"} ≥ ${fmtAny(l.target)} · max ${pyStr(l.max_passes)}`;
  }

  /** Stage names in the loop: → between steps, ∥ between branches, [ ] around inner loops. */
  loopSpan(l: Loop): string {
    const parts: string[] = [];
    for (const g of this.chunks(l.blocks, true, l)) {
      const inner = this.childLoop(g[0] as string, l);
      if (inner) {
        parts.push("[" + this.loopSpan(inner) + "]");
        continue;
      }
      const names = g
        .map((b) => this.block(b) as Block)
        .filter((b) => b.type === "stage")
        .map((b) => (truthy(b.name) ? pyStr(b.name) : "Untitled"));
      if (names.length) parts.push(names.join(" ∥ "));
    }
    return parts.join(" → ") || "prompt block";
  }

  // ------------------------------------------------------------ edits
  newBlock(kind: BlockKind | string, template?: string | null): Block {
    const bid = this.nextId("b");
    if (kind === "prompt") return { id: bid, type: "prompt", text: "" };
    if (kind === "intentions") return { ...blockSettings({}), id: bid, type: "intentions" };
    if (kind === "function") return { id: bid, type: "function", name: this.freeFnName(), params: [], text: "" };
    const t = hasKey(TEMPLATES, template) ? TEMPLATES[template as TemplateKey] : null;
    const b: Block = { id: bid, type: "stage", name: t ? t.name : "", prompt: t ? t.prompt : "" };
    if (t) b.template = template;
    return b;
  }

  freeFnName(): string {
    const taken = new Set(this.functions().keys());
    let n = 1;
    while (taken.has(fnKey(`New function ${n}`))) n += 1;
    return `New function ${n}`;
  }

  insert(at: number, kind: BlockKind | string, loopId?: string | null, template?: string | null, parId?: string | null): string {
    const existing = this.intentions();
    if (kind === "intentions" && existing) return existing.id;
    const b = this.newBlock(kind, template);
    this.blocks.splice(Math.max(0, Math.min(at, this.blocks.length)), 0, b);
    this.join(b.id, kind === "function" ? null : loopId);
    const p = parId ? this.par(parId) : null;
    if (p) p.blocks.push(b.id);
    this.sync();
    return b.id;
  }

  /** `_join`: put bid in loop loopId and in every loop around it. */
  private join(bid: string, loopId: string | null | undefined): void {
    const chain: Loop[] = [];
    let l = loopId ? this.loop(loopId) : null;
    while (l) {
      chain.push(l);
      l = this.parentLoop(l);
    }
    for (const x of chain) x.blocks.push(bid);
  }

  addBranch(parId: string, template?: string | null): string {
    const p = this.par(parId);
    if (!p) throw new Error(`no parallel group ${parId}`);
    const lp = this.loopOf(p.blocks[0] as string);
    return this.insert(this.idx(p.blocks[p.blocks.length - 1] as string) + 1, "stage", lp ? lp.id : null, template, parId);
  }

  /** Add after the focused block / group / loop (outside its parallel group / that loop), else at the end. */
  insertAfter(focus: Focus, kind: BlockKind | string, template?: string | null): string {
    const [kf, fid] = focus ?? [null, null];
    let at = this.blocks.length;
    let loopId: string | null = null;
    if (kf === "block" && fid && this.block(fid)) {
      const p = this.parOf(fid);
      const ids = p ? p.blocks : [fid];
      at = this.idx(ids[ids.length - 1] as string) + 1;
      loopId = this.loopOf(fid)?.id ?? null;
    } else if (kf === "par" && this.par(fid)) {
      const p = this.par(fid) as Parallel;
      at = this.idx(p.blocks[p.blocks.length - 1] as string) + 1;
      loopId = this.loopOf(p.blocks[0] as string)?.id ?? null;
    } else if (kf === "loop" && this.loop(fid)) {
      const l = this.loop(fid) as Loop;
      at = this.idx(l.blocks[l.blocks.length - 1] as string) + 1;
      loopId = this.parentLoop(l)?.id ?? null;
    }
    return this.insert(at, kind, loopId, template);
  }

  remove(bid: string): void {
    const i = this.idx(bid);
    if (i >= 0) {
      this.blocks.splice(i, 1);
      this.sync();
    }
  }

  private moveScope(bid: string): [string[], string[][]] {
    const p = this.parOf(bid);
    const l = this.loopOf(bid);
    if (p) return [p.blocks, p.blocks.map((b) => [b])];
    const ids = l ? l.blocks : this.ids();
    return [ids, this.chunks(ids, true, l)];
  }

  canMove(bid: string, d: number): boolean {
    const [, units] = this.moveScope(bid);
    const k = units.findIndex((u) => u.includes(bid));
    return k >= 0 && (units[k] as string[]).length === 1 && k + d >= 0 && k + d < units.length;
  }

  /** ↑/↓ (or ←/→ inside a parallel group): swap with the neighbouring unit in the same scope. */
  move(bid: string, d: number): boolean {
    if (!this.canMove(bid, d)) return false;
    const [ids, units] = this.moveScope(bid);
    const k = units.findIndex((u) => u.includes(bid));
    [units[k], units[k + d]] = [units[k + d] as string[], units[k] as string[]];
    const start = this.idx(ids[0] as string);
    const moved = units.flat().map((b) => this.block(b) as Block);
    this.blocks.splice(start, ids.length, ...moved);
    this.sync();
    return true;
  }

  /** Drag-and-drop: drop on gap `at` (inside loopId if given) or onto parallel group parId. */
  moveTo(bid: string, atIn: number, loopId?: string | null, parId?: string | null): boolean {
    let at = atIn;
    const b = this.block(bid);
    if (!b || (parId && b.type !== "stage")) return false;
    const frm = this.idx(bid);
    this.blocks.splice(frm, 1);
    for (const g of [...this.loops, ...this.parallels]) {
      const k = g.blocks.indexOf(bid);
      if (k >= 0) g.blocks.splice(k, 1);
    }
    const p = parId ? this.par(parId) : null;
    if (p && p.blocks.length) {
      at = this.idx(p.blocks[p.blocks.length - 1] as string) + 1;
      p.blocks.push(bid);
      const lp = this.loopOf(p.blocks[0] as string);
      this.join(bid, lp ? lp.id : null);
    } else {
      if (at > frm) at -= 1;
      this.join(bid, loopId);
    }
    this.blocks.splice(Math.max(0, Math.min(at, this.blocks.length)), 0, b);
    this.sync();
    return true;
  }

  // ------------------------------------------------------------ grouping
  loopCheck(ids: string[]): [boolean, string] {
    if (!ids.length) return [false, ""];
    const s = new Set(ids);
    const same = (a: Set<string>, b: Set<string>) => a.size === b.size && isSubset(a, b);
    if (this.loops.some((l) => same(new Set(l.blocks), s))) return [false, "These blocks are already a loop."];
    if (!this.contiguous(ids)) return [false, "Loop blocks must sit next to each other."];
    if (ids.some((b) => {
      const p = this.parOf(b);
      return p && !isSubset(new Set(p.blocks), s);
    })) {
      return [false, "Select every branch of a parallel group to loop it."];
    }
    if (this.loops.some((l) => !nests(s, new Set(l.blocks)))) {
      return [false, "A loop can sit inside another loop or wrap all of it, not cut across it."];
    }
    return [true, ""];
  }

  parCheck(ids: string[]): [boolean, string] {
    if (ids.length < 2) return [false, "Pick two or more stages to run them in parallel."];
    if (ids.some((b) => this.block(b)?.type !== "stage")) return [false, "Only stages can run in parallel, not prompt blocks."];
    if (ids.some((b) => this.parOf(b))) return [false, "A selected stage is already in a parallel group."];
    if (!this.contiguous(ids)) return [false, "Parallel stages must sit next to each other."];
    if (new Set(ids.map((b) => this.loopOf(b)?.id ?? null)).size > 1) {
      return [false, "Parallel stages must all be in the same loop, or all outside loops."];
    }
    return [true, ""];
  }

  private byIdx(ids: string[]): string[] {
    return [...ids].sort((a, b) => this.idx(a) - this.idx(b));
  }

  makeLoop(ids: string[]): string | null {
    if (!this.loopCheck(ids)[0]) return null;
    const lid = this.nextId("l");
    this.loops.push({ ...deepClone(LOOP_DEFAULTS), id: lid, blocks: this.byIdx(ids) } as Loop);
    this.sync();
    return lid;
  }

  makePar(ids: string[]): string | null {
    if (!this.parCheck(ids)[0]) return null;
    const pid = this.nextId("p");
    this.parallels.push({ id: pid, blocks: this.byIdx(ids), join: "all" });
    this.sync();
    return pid;
  }

  removeLoop(lid: string): void {
    this.loops = this.loops.filter((l) => l.id !== lid);
  }

  ungroup(pid: string): void {
    this.parallels = this.parallels.filter((p) => p.id !== pid);
  }
}

// ---------------------------------------------------------------- prompt text

/** Python `str.rstrip(LETTERS)`: "3a" -> "3". */
export function stripLetters(n: string): string {
  let e = n.length;
  while (e > 0 && LETTERS.includes(n[e - 1] as string)) e--;
  return n.slice(0, e);
}


/** `workflow_prompt`: the `## Workflow` section that replaces `## Task` on the Stages tab. */
export function workflowPrompt(wf: Workflow): string {
  const nums = wf.stageNumbers();
  const lines: string[] = [];
  const fns = wf.functions();
  const blk = (id: string) => wf.block(id) as Block;
  const modelHint = (m: unknown) => (oneOf(STAGE_MODELS, m) ? ` (run on the \`${m}\` model, in a subagent if needed)` : "");

  const one = (b: Block): string => {
    if (b.type === "stage") {
      const n = nums[b.id] as string;
      const ro = truthy(b.read_only) ? " **[READ-ONLY]**" : "";
      let body = renderCalls(pyStrip(text(b.prompt)), fns);
      if (truthy(b.read_only)) body = READ_ONLY_NOTE + (body ? " " + body : "");
      return `${n}. **${truthy(b.name) ? pyStr(b.name) : "Stage " + n}**${ro}${modelHint(b.model)} — ${body}`;
    }
    return "**Note:** " + renderCalls(pyStrip(text(b.text)), fns);
  };

  const unit = (g: string[]): string[] => {
    if (g.length === 1) {
      const b = blk(g[0] as string);
      if (b.type === "intentions" || b.type === "function") return [];
      return [one(b)];
    }
    const p = wf.parOf(g[0] as string) as Parallel;
    const head = `${stripLetters(nums[g[0] as string] as string)}. **In parallel**, one worker per branch. ${
      p.join === "all"
        ? "Wait for every branch to finish before moving on:"
        : "Move on as soon as the first branch finishes, and stop the others:"
    }`;
    return [head, ...g.map((b) => "   - " + one(blk(b)))];
  };

  const stageSpan = (l: Loop): string | null => {
    const stages = l.blocks.filter((b) => blk(b).type === "stage");
    if (!stages.length) return null;
    const a = nums[stages[0] as string] as string;
    const z = nums[stages[stages.length - 1] as string] as string;
    return a === z ? "stage " + a : `stages ${a}–${z}`;
  };

  const loopLine = (l: Loop): string => {
    const short = stageSpan(l);
    const span = short ? `${short} (${wf.loopSpan(l)})` : "the note above";
    let t: string;
    if (!truthy(l.agentic)) {
      t = `After each pass through ${span}, show me the result and ask whether to run another pass.`;
    } else if (l.mode === "count") {
      t = `Loop ${span} as an agentic loop: run it exactly ${pyStr(l.count)} times without stopping to ask me.`;
    } else {
      const m = truthy(l.metric) ? pyStr(l.metric) : "metric";
      t =
        `Loop ${span} as an agentic loop without stopping to ask me. After each pass, score it with this ` +
        `reward function: ${pyStrip(text(l.reward)) || "<reward function>"} Report \`${m}\` after every pass. ` +
        `Stop when \`${m}\` ≥ ${fmtAny(l.target)}, or after ${pyStr(l.max_passes)} passes, ` +
        `whichever comes first. If you hit the cap, tell me the best score and what is still off.`;
    }
    const parent = wf.parentLoop(l);
    if (parent) {
      t += ` This loop is nested inside the loop over ${stageSpan(parent) || "the note above"}: run it again in full on every pass of that loop.`;
    }
    return t;
  };

  const emit = (ids: string[], within: Loop | null): void => {
    for (const g of wf.chunks(ids, true, within)) {
      const l = wf.childLoop(g[0] as string, within);
      if (l) {
        emit(l.blocks, l);
        lines.push("   ↻ **Loop:** " + loopLine(l));
      } else lines.push(...unit(g));
    }
  };
  emit(wf.ids(), null);

  const out = ["## Workflow", "", "**Goal:** " + (pyStrip(wf.goal) || "<describe the goal here>")];
  const oc = wf.on_cancel;
  if (oc.stages.length) {
    out.push("", "**On cancel:** " + fill(ON_CANCEL_HEAD, { grace: fmtNum(oc.grace_minutes) }), "");
    oc.stages.forEach((st, k) => {
      const i = k + 1;
      out.push(
        `C${i}. **${pyStrip(st.name) || "Cancel stage " + i}**${modelHint(st.model)} — ${renderCalls(pyStrip(st.prompt), fns)}`,
      );
    });
  }
  if (fns.size) {
    out.push("", "### Reusable instructions", "", FUNCTIONS_HEAD);
    for (const fn of fns.values()) {
      const ps = params(fn);
      const need = [
        truthy(fn.params) ? "fill in: " + ps.join(", ") : "",
        oneOf(STAGE_MODELS, fn.model) ? `run on the \`${fn.model}\` model` : "",
      ]
        .filter((x) => x)
        .join("; ");
      out.push(
        "",
        `**${pyStrip(text(fn.name))}**${need ? ` (${need})` : ""}`,
        "",
        renderCalls(pyStrip(text(get(fn, "text", ""))), fns) || "<empty>",
      );
    }
  }
  if (lines.length) {
    out.push("", "Work through these steps in order. Finish each step before starting the next, and tell me when you move on.", "", ...lines);
  }
  return out.join("\n");
}
