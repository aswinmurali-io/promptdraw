// Prompt flags: one workflow, several compiled prompts (A/B variants).
// A workflow declares flags (bool or text); blocks carry `when:` and text carries
// `{{#if …}}{{#elif …}}{{#else}}{{/if}}` / `{{@flag}}`. `resolveFlagsDict` strips whatever a
// given flag set rules out, before the normal compile runs, so the compiled prompt has no
// trace of the other branch (mode `strip`). Mode `embed` keeps both, labelled Variant A / B, and
// says which to use. Not in the Python app: a workflow without flags, `when` or markers
// compiles exactly as before.
// Pure: no DOM, no I/O, and only type imports from workflow.ts (workflow.ts imports this).
// @lat: [[core#Prompt flags]]
import { isPlainObject, pyRepr, pyStr, pyStrip } from "./py";
import type { WorkflowDict } from "./workflow";

export type FlagValue = boolean | string;
/** `strip` removes what a flag rules out; `embed` keeps every branch, labelled, and says which one to follow. */
export type FlagMode = "strip" | "embed";
export type FlagValues = Record<string, FlagValue>;
export interface FlagDef {
  name: string;
  type: "bool" | "text";
  default: FlagValue;
  label?: string;
}

/** A bad flag value, an unknown flag, or a malformed `{{#if}}` / `when`. */
export class FlagError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlagError";
  }
}

const NAME_RE = /^[a-z][a-z0-9_]*$/;
const TRUE_WORDS = ["true", "yes", "on", "1"];
const FALSE_WORDS = ["false", "no", "off", "0"];

/** `true` / `false` for the usual words, undefined for anything else. */
export function boolWord(s: string): boolean | undefined {
  const low = pyStrip(s).toLowerCase();
  if (TRUE_WORDS.includes(low)) return true;
  if (FALSE_WORDS.includes(low)) return false;
  return undefined;
}

function asText(v: unknown): string {
  return typeof v === "boolean" ? (v ? "true" : "false") : pyStr(v);
}

/** The declared flags: known name shape, bool or text, a default of the right kind; first of a name wins. */
export function cleanFlags(raw: unknown): FlagDef[] {
  const out: FlagDef[] = [];
  for (const f of Array.isArray(raw) ? raw : []) {
    if (!isPlainObject(f)) continue;
    const name = typeof f.name === "string" ? pyStrip(f.name) : "";
    if (!NAME_RE.test(name) || out.some((d) => d.name === name)) continue;
    const type = f.type === "text" ? "text" : "bool";
    const def: FlagDef =
      type === "text"
        ? { name, type, default: f.default === undefined || f.default === null ? "" : asText(f.default) }
        : { name, type, default: typeof f.default === "boolean" ? f.default : boolWord(asText(f.default)) ?? false };
    if (typeof f.label === "string" && pyStrip(f.label)) def.label = pyStrip(f.label);
    out.push(def);
  }
  return out;
}

/** One value for a flag: a bool flag takes true/false or on/off/yes/no/1/0, a text flag takes any text. */
export function coerceFlag(def: FlagDef, v: unknown): FlagValue {
  if (def.type === "text") return asText(v);
  if (typeof v === "boolean") return v;
  const b = boolWord(asText(v));
  if (b === undefined) throw new FlagError(`flag ${def.name} is on or off, not ${pyRepr(asText(v))}`);
  return b;
}

/** Every declared flag's value: its default, then what was given. A flag nobody declared is an error (a typo). */
export function flagValues(defs: FlagDef[], given?: Record<string, unknown>): Map<string, FlagValue> {
  const out = new Map<string, FlagValue>(defs.map((d) => [d.name, d.default]));
  for (const [k, v] of Object.entries(given ?? {})) {
    const def = defs.find((d) => d.name === k);
    if (!def) {
      throw new FlagError(
        `unknown flag ${pyRepr(k)}` + (defs.length ? ` (declared: ${defs.map((d) => d.name).join(", ")})` : " (the workflow declares none)"),
      );
    }
    out.set(k, coerceFlag(def, v));
  }
  return out;
}

/** The given values that name a declared flag and read as that flag's kind; anything stale or invalid is left out. */
export function usableFlags(defs: FlagDef[], given: Record<string, unknown>): FlagValues {
  const out: FlagValues = {};
  for (const [k, v] of Object.entries(given)) {
    const def = defs.find((d) => d.name === k);
    if (!def) continue;
    try {
      out[k] = coerceFlag(def, v);
    } catch {
      /* a value the flag cannot take */
    }
  }
  return out;
}

/** `--flag KEY=VALUE` arguments -> values; booleans stay text and are read per flag by `flagValues`. */
export function parseFlagArgs(args: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const kv of args) {
    const at = kv.indexOf("=");
    const key = pyStrip(at < 0 ? kv : kv.slice(0, at));
    if (!NAME_RE.test(key)) throw new FlagError(`--flag takes KEY=VALUE with a lower-case KEY, not ${pyRepr(kv)}`);
    out[key] = at < 0 ? "true" : kv.slice(at + 1);
  }
  return out;
}

// ---------------------------------------------------------------- conditions

interface Cond {
  not: boolean;
  name: string;
  op?: "==" | "!=";
  lit?: string;
}

const COND_RE = /^(!)?\s*([a-z][a-z0-9_]*)\s*(?:(==|!=)\s*([\s\S]+))?$/;

function literal(raw: string): string {
  const s = pyStrip(raw);
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
    try {
      const v: unknown = JSON.parse(s);
      if (typeof v === "string") return v;
    } catch {
      /* fall through to the raw inside */
    }
    return s.slice(1, -1);
  }
  if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'") return s.slice(1, -1);
  return s;
}

/** `flag`, `!flag`, `flag == value`, `flag != value` (value: bare or quoted). */
export function parseCond(expr: string, where: string): Cond {
  const m = COND_RE.exec(pyStrip(expr));
  if (!m) throw new FlagError(`${where}: cannot read the condition ${pyRepr(expr)} (use flag, !flag, flag == "text" or flag != "text")`);
  const [, bang, name, op, lit] = m;
  if (bang && op) throw new FlagError(`${where}: ${pyRepr(pyStrip(expr))} mixes ! with ${op}; use != instead`);
  return { not: Boolean(bang), name: name as string, ...(op ? { op: op as "==" | "!=", lit: literal(lit as string) } : {}) };
}

function isTruthy(v: FlagValue): boolean {
  if (typeof v === "boolean") return v;
  const s = pyStrip(v).toLowerCase();
  return s !== "" && s !== "null" && !FALSE_WORDS.includes(s);
}

function value(values: Map<string, FlagValue>, name: string, where: string): FlagValue {
  const v = values.get(name);
  if (v === undefined) throw new FlagError(`${where}: unknown flag ${pyRepr(name)}`);
  return v;
}

/** Does the condition hold for these values? A bool flag compares with on/off words, a text flag with exact text. */
export function evalCond(expr: string, values: Map<string, FlagValue>, where: string): boolean {
  const c = parseCond(expr, where);
  const v = value(values, c.name, where);
  if (!c.op) return c.not ? !isTruthy(v) : isTruthy(v);
  let same: boolean;
  if (typeof v === "boolean") {
    const lit = boolWord(c.lit as string);
    if (lit === undefined) throw new FlagError(`${where}: flag ${c.name} is on or off, not ${pyRepr(c.lit)}`);
    same = v === lit;
  } else same = v === c.lit;
  return c.op === "==" ? same : !same;
}

// ---------------------------------------------------------------- text

type Tok =
  | { kind: "text"; s: string }
  | { kind: "if"; expr: string; alone: boolean }
  | { kind: "elif"; expr: string }
  | { kind: "else" | "end" };
type Node = string | { open: string; alone: boolean; branches: { expr: string | null; body: Node[] }[] };

const TAG_RE = /\{\{[ \t]*(#if|#elif|#else|\/if)\b([^}\n]*)\}\}/g;
const AT_RE = /\{\{[ \t]*@([a-z][a-z0-9_]*)[ \t]*\}\}/g;

/** Split text into literal runs and tags. A tag alone on its line takes the whole line with it. */
function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let last = 0;
  for (const m of src.matchAll(TAG_RE)) {
    let start = m.index;
    let end = start + m[0].length;
    let alone = false;
    const lineStart = start === 0 ? 0 : src.lastIndexOf("\n", start - 1) + 1;
    const nl = src.indexOf("\n", end);
    const lineEnd = nl < 0 ? src.length : nl;
    if (/^[ \t]*$/.test(src.slice(lineStart, start)) && /^[ \t]*$/.test(src.slice(end, lineEnd))) {
      start = lineStart;
      end = nl < 0 ? src.length : nl + 1;
      alone = true;
    }
    if (start > last) toks.push({ kind: "text", s: src.slice(last, start) });
    const tag = m[1] as string;
    toks.push(tag === "#if" ? { kind: "if", expr: m[2] as string, alone } : tag === "#elif" ? { kind: "elif", expr: m[2] as string } : tag === "#else" ? { kind: "else" } : { kind: "end" });
    last = end;
  }
  if (last < src.length) toks.push({ kind: "text", s: src.slice(last) });
  return toks;
}

function parse(src: string, where: string): Node[] {
  const toks = tokenize(src);
  let i = 0;
  const seq = (): Node[] => {
    const out: Node[] = [];
    while (i < toks.length) {
      const t = toks[i] as Tok;
      if (t.kind === "text") {
        out.push(t.s);
        i++;
      } else if (t.kind === "if") {
        i++;
        out.push(cond(t.expr, t.alone));
      } else break;
    }
    return out;
  };
  const cond = (open: string, alone: boolean): Node => {
    const branches: { expr: string | null; body: Node[] }[] = [{ expr: open, body: seq() }];
    let sawElse = false;
    for (;;) {
      const t = toks[i];
      if (!t) throw new FlagError(`${where}: {{#if ${pyStrip(open)}}} is never closed with {{/if}}`);
      i++;
      if (t.kind === "end") return { open, alone, branches };
      if (sawElse) throw new FlagError(`${where}: {{#if ${pyStrip(open)}}} has a branch after its {{#else}}`);
      if (t.kind === "elif") branches.push({ expr: t.expr, body: seq() });
      else if (t.kind === "else") {
        sawElse = true;
        branches.push({ expr: null, body: seq() });
      }
    }
  };
  const nodes = seq();
  if (i < toks.length) throw new FlagError(`${where}: a {{#elif}}, {{#else}} or {{/if}} has no {{#if}} before it`);
  return nodes;
}

/** A, B, C … for the n-th branch or condition. */
export function variantLetter(n: number): string {
  return n < 26 ? String.fromCharCode(65 + n) : "V" + (n + 1);
}

function render(nodes: Node[], values: Map<string, FlagValue>, where: string, mode: FlagMode): string {
  let out = "";
  for (const n of nodes) {
    if (typeof n === "string") {
      out += n.replace(AT_RE, (_m, name: string) => asText(value(values, name, where)));
      continue;
    }
    const chosen = n.branches.findIndex((b) => b.expr === null || evalCond(b.expr, values, where));
    if (mode === "strip") {
      const b = n.branches[chosen];
      if (b) out += render(b.body, values, where, mode);
      continue;
    }
    const parts = n.branches.map((b, i) => {
      const head = `**Variant ${variantLetter(i)} (${b.expr === null ? "otherwise" : pyStrip(b.expr)}):**`;
      const body = render(b.body, values, where, mode);
      return n.alone ? head + "\n" + (body.endsWith("\n") || body === "" ? body : body + "\n") : head + " " + pyStrip(body);
    });
    const pick = chosen >= 0 ? `**Use variant ${variantLetter(chosen)}.**` : "**No variant applies; skip this.**";
    out += n.alone ? parts.join("") + pick + "\n" : parts.join(" ") + " " + pick;
  }
  return out;
}

/** The text with every `{{#if}}` decided and every `{{@flag}}` filled in. Text with neither comes back as it was. */
export function applyFlags(src: string, values: Map<string, FlagValue>, where: string, mode: FlagMode = "strip"): string {
  if (!src.includes("{{")) return src;
  return render(parse(src, where), values, where, mode);
}

/** One branch of an inline `{{#if}}` chain, as written: its letter, its condition (null for `{{#else}}`) and its text. */
export interface BranchRow {
  letter: string;
  cond: string | null;
  /** The branch's own text with whitespace folded; a nested `{{#if}}` shows as "…". */
  body: string;
}
/** An inline `{{#if}}` chain: the flag its first condition reads and its branches in order. */
export interface InlineChain {
  flag: string;
  branches: BranchRow[];
}

function bodyText(nodes: Node[]): string {
  return nodes.map((n) => (typeof n === "string" ? n : " … ")).join("").replace(/\s+/g, " ").trim();
}

/**
 * Every `{{#if}}` chain in a text, outer chains first, nested ones after. Throws FlagError on a
 * malformed marker (the same ones `flagsRead` throws on).
 */
export function inlineChains(src: string, where = "text"): InlineChain[] {
  if (!src.includes("{{#")) return [];
  const out: InlineChain[] = [];
  const walk = (nodes: Node[]): void => {
    for (const n of nodes) {
      if (typeof n === "string") continue;
      const first = n.branches.find((b) => b.expr !== null);
      let flag = "";
      try {
        flag = first && first.expr !== null ? parseCond(first.expr, where).name : "";
      } catch {
        flag = "";
      }
      out.push({
        flag,
        branches: n.branches.map((b, i) => ({ letter: variantLetter(i), cond: b.expr === null ? null : pyStrip(b.expr), body: bodyText(b.body) })),
      });
      for (const b of n.branches) walk(b.body);
    }
  };
  walk(parse(src, where));
  return out;
}

function used(nodes: Node[], names: Set<string>, where: string): void {
  for (const n of nodes) {
    if (typeof n === "string") {
      for (const m of n.matchAll(AT_RE)) names.add(m[1] as string);
      continue;
    }
    for (const b of n.branches) {
      if (b.expr !== null) names.add(parseCond(b.expr, where).name);
      used(b.body, names, where);
    }
  }
}

/** Flag names a text reads (throws FlagError on a malformed marker). */
export function flagsRead(src: string, where: string): string[] {
  if (!src.includes("{{")) return [];
  const names = new Set<string>();
  used(parse(src, where), names, where);
  return [...names];
}

// ---------------------------------------------------------------- workflow

type Fields = Record<string, unknown>;
const TEXT_FIELDS = ["name", "prompt", "text"] as const;

function whereBlock(b: Fields): string {
  return b.type === "stage" && typeof b.name === "string" && b.name ? `stage ${pyRepr(b.name)}` : `block ${pyStr(b.id)}`;
}

function hasMarkers(d: WorkflowDict): boolean {
  if ((d.flags ?? []).length) return true;
  const marked = (s: unknown) => typeof s === "string" && (s.includes("{{#") || s.includes("{{@") || s.includes("{{/if"));
  return (
    marked(d.goal) ||
    d.blocks.some((b) => pyStrip(pyStr(b.when ?? "")) !== "" || TEXT_FIELDS.some((k) => marked(b[k]))) ||
    d.on_cancel.stages.some((s) => marked(s.name) || marked(s.prompt))
  );
}

/**
 * Variant letters for the blocks that carry a `when`: per flag, each distinct condition gets the next letter
 * (A, B, …) in document order, so `when: f` and `when: "!f"` read as A and B.
 */
export function whenVariants(blocks: WorkflowDict["blocks"]): Map<string, { flag: string; letter: string }> {
  const seen = new Map<string, string[]>();
  const out = new Map<string, { flag: string; letter: string }>();
  for (const b of blocks) {
    const when = typeof b.when === "string" ? pyStrip(b.when) : "";
    if (!when || b.type === "intentions" || out.has(when)) continue;
    let flag: string;
    try {
      flag = parseCond(when, "when").name;
    } catch {
      continue;
    }
    const conds = seen.get(flag) ?? [];
    out.set(when, { flag, letter: variantLetter(conds.length) });
    seen.set(flag, [...conds, when]);
  }
  return out;
}

/**
 * The workflow with these flags decided. Values not given come from the declared defaults.
 * - `strip`: blocks whose `when` fails are dropped, every `{{#if}}` is resolved, `{{@flag}}` is filled in.
 * - `embed`: every block and every branch stays, labelled Variant A / B …, with the one to follow marked
 *   (a block as "use" or "skip", an `{{#if}}` with "Use variant A.").
 * `flags` and `when` are gone from the result. Without flags, `when` or markers the dict comes back as it was.
 */
export function resolveFlagsDict(d: WorkflowDict, given?: Record<string, unknown>, mode: FlagMode = "strip"): WorkflowDict {
  const defs = cleanFlags(d.flags);
  if (!hasMarkers(d) && !Object.keys(given ?? {}).length) return d;
  const values = flagValues(defs, given);
  const letters = whenVariants(d.blocks);
  const blocks: WorkflowDict["blocks"] = [];
  for (const b of d.blocks) {
    const where = whereBlock(b);
    const when = typeof b.when === "string" ? pyStrip(b.when) : "";
    const gated = when !== "" && b.type !== "intentions";
    const pass = !gated || evalCond(when, values, `${where} when`);
    if (!pass && mode === "strip") continue;
    const nb = { ...b } as Fields;
    delete nb.when;
    for (const k of TEXT_FIELDS) if (typeof nb[k] === "string") nb[k] = applyFlags(nb[k] as string, values, where, mode);
    if (gated && mode === "embed") {
      const v = letters.get(when);
      const tag = `Variant ${v?.letter ?? "?"} (${when}): ${pass ? "use" : "skip, not selected"}`;
      if (b.type === "stage") nb.name = `${pyStr(nb.name ?? "")} [${tag}]`;
      else if (b.type === "prompt" || b.type === "function") nb.text = `**${tag}.** ${pyStr(nb.text ?? "")}`;
    }
    blocks.push(nb as WorkflowDict["blocks"][number]);
  }
  const rest: WorkflowDict = { ...d };
  delete rest.flags;
  return {
    ...rest,
    goal: applyFlags(d.goal, values, "goal", mode),
    on_cancel: {
      ...d.on_cancel,
      stages: d.on_cancel.stages.map((s, i) => ({
        ...s,
        name: applyFlags(s.name, values, `cancel stage ${i + 1}`, mode),
        prompt: applyFlags(s.prompt, values, `cancel stage ${i + 1}`, mode),
      })),
    },
    blocks,
  };
}

/** Human-readable problems with a workflow's flags: malformed markers, undeclared flags, flags nothing uses. */
export function flagProblems(d: WorkflowDict): string[] {
  const out: string[] = [];
  const defs = cleanFlags(d.flags);
  const declared = new Set(defs.map((f) => f.name));
  const read = new Set<string>();
  const check = (names: string[], where: string): void => {
    for (const n of names) {
      read.add(n);
      if (!declared.has(n)) out.push(`${where} uses unknown flag ${pyRepr(n)}`);
    }
  };
  const scan = (src: unknown, where: string): void => {
    if (typeof src !== "string") return;
    try {
      check(flagsRead(src, where), where);
    } catch (e) {
      if (e instanceof FlagError) out.push(e.message);
      else throw e;
    }
  };
  scan(d.goal, "goal");
  d.blocks.forEach((b) => {
    const where = whereBlock(b);
    const when = typeof b.when === "string" ? pyStrip(b.when) : "";
    if (when) {
      if (b.type === "intentions") out.push(`${where} has a when, which an intentions block ignores`);
      else {
        try {
          check([parseCond(when, `${where} when`).name], `${where} when`);
        } catch (e) {
          if (e instanceof FlagError) out.push(e.message);
          else throw e;
        }
      }
    }
    for (const k of TEXT_FIELDS) scan(b[k], where);
  });
  d.on_cancel.stages.forEach((s, i) => {
    scan(s.name, `Cancel stage ${i + 1}`);
    scan(s.prompt, `Cancel stage ${i + 1}`);
  });
  for (const f of defs) if (!read.has(f.name)) out.push(`Flag ${pyRepr(f.name)} is declared but nothing uses it`);
  return out;
}
