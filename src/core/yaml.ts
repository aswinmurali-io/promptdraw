// Port of the Python app's workflow.py's hand-rolled YAML subset reader/writer (to_yaml / from_yaml).
// The shipped workflow files rely on its quirks and round-trip byte for byte, so this is
// a line-by-line port, not a general YAML library.
// @lat: [[core#Modules]]
import { LOOP_DEFAULTS, SETTINGS, STAGE_MODELS, TEMPLATES, WORKSPACE, hasKey, oneOf } from "./constants";
import { blockSettings } from "./intentions";
import {
  PY_WS,
  PyFloat,
  asciiDigits,
  fmtNum,
  isPlainObject,
  isPyInt,
  isPyNumber,
  numberValue,
  pyLstrip,
  pyRepr,
  pyRstrip,
  pySplitlines,
  pyStr,
  pyStrip,
  truthy,
} from "./py";
import { cleanWorkspace, Workflow, type Block, type Loop, type Parallel } from "./workflow";

/** A value the YAML subset can hold. Floats are `PyFloat`, ints plain numbers. */
export type YamlValue = string | number | boolean | null | PyFloat | YamlValue[] | { [k: string]: YamlValue };

export class YamlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YamlError";
  }
}

const PLAIN_RE = /^[A-Za-z_][A-Za-z0-9_ .,()/-]*$/;
const RESERVED = new Set(["true", "false", "yes", "no", "on", "off", "null", "~"]);

/** `_scalar_out`. */
export function scalarOut(v: unknown): string {
  if (typeof v === "boolean") return v ? "true" : "false";
  if (isPyNumber(v)) return fmtNum(v);
  const s = pyStr(v);
  if (PLAIN_RE.test(s) && s === pyStrip(s) && !RESERVED.has(s.toLowerCase())) return s;
  return JSON.stringify(s);
}

/** `_prompt_out`: `    key: …` lines; multi-line text that survives a round trip becomes a block scalar. */
export function promptOut(value: unknown, key = "prompt"): string[] {
  const t = pyStr(value);
  const body = t.endsWith("\n") && !t.endsWith("\n\n") ? t.slice(0, -1) : t;
  const lines = body.split("\n");
  const safe =
    t.includes("\n") &&
    pyStrip(body) !== "" &&
    !body.startsWith(" ") &&
    !body.startsWith("\n") &&
    !body.endsWith("\n") &&
    lines.every((l) => l === pyRstrip(l) && !l.includes("\t") && !l.includes("\r"));
  if (!safe) return [`    ${key}: ` + scalarOut(t)];
  return [`    ${key}: ` + (t.endsWith("\n") ? "|" : "|-"), ...lines.map((l) => (l ? "      " + l : ""))];
}

/** `to_yaml`. */
export function toYaml(wf: Workflow): string {
  const d = wf.toDict();
  const out = ["# Stage workflow — Prompt Builder", "name: " + scalarOut(d.name), "version: 1", "goal: " + scalarOut(d.goal)];
  for (const k of Object.keys(WORKSPACE) as (keyof typeof d.workspace)[]) {
    if (d.workspace[k] !== undefined) out.push(`${k}: ${scalarOut(d.workspace[k])}`);
  }
  if (d.flags?.length) {
    out.push("flags:");
    for (const f of d.flags) {
      out.push("  - name: " + f.name, "    type: " + f.type, "    default: " + scalarOut(f.default));
      if (f.label) out.push("    label: " + scalarOut(f.label));
    }
  }
  const oc = d.on_cancel;
  if (oc.stages.length) {
    out.push(`cancel_grace_minutes: ${fmtNum(oc.grace_minutes)}`, "on_cancel:");
    for (const s of oc.stages) {
      out.push("  - name: " + scalarOut(s.name), ...promptOut(s.prompt));
      if (oneOf(STAGE_MODELS, s.model)) out.push("    model: " + s.model);
    }
  }
  const raw = (v: unknown) => pyStr(v);
  const listOut = (v: unknown) => "[" + (Array.isArray(v) ? v.map(raw) : []).join(", ") + "]";
  out.push("blocks:" + (d.blocks.length ? "" : " []"));
  for (const b of d.blocks) {
    out.push("  - id: " + raw(b.id), "    type: " + raw(b.type));
    if (truthy(b.template)) out.push("    template: " + raw(b.template));
    if (typeof b.when === "string" && pyStrip(b.when) && b.type !== "intentions") out.push("    when: " + scalarOut(pyStrip(b.when)));
    const get = (k: string, def: unknown) => (Object.prototype.hasOwnProperty.call(b, k) ? b[k] : def);
    if (b.type === "stage") {
      out.push("    name: " + scalarOut(get("name", "")), ...promptOut(get("prompt", "")));
      if (oneOf(STAGE_MODELS, b.model)) out.push("    model: " + b.model);
      if (truthy(b.read_only)) out.push("    read_only: true");
    } else if (b.type === "function") {
      out.push("    name: " + scalarOut(get("name", "")), "    params: " + listOut(get("params", [])));
      if (oneOf(STAGE_MODELS, b.model)) out.push("    model: " + b.model);
      out.push(...promptOut(get("text", ""), "text"));
    } else if (b.type === "intentions") {
      const s = blockSettings(b);
      out.push("    toggles: [" + s.toggles.join(", ") + "]");
      for (const k of SETTINGS) out.push(`    ${k}: ${scalarOut(s[k])}`);
    } else {
      out.push("    text: " + scalarOut(get("text", "")));
    }
  }
  out.push("parallels:" + (d.parallels.length ? "" : " []"));
  for (const p of d.parallels) out.push("  - id: " + raw(p.id), "    blocks: " + listOut(p.blocks), "    join: " + raw(p.join));
  out.push("loops:" + (d.loops.length ? "" : " []"));
  for (const l of d.loops) {
    out.push("  - id: " + raw(l.id), "    blocks: " + listOut(l.blocks));
    for (const k of ["agentic", "mode", "count", "reward", "metric", "target", "max_passes"] as const) {
      out.push(`    ${k}: ${scalarOut(l[k])}`);
    }
  }
  return out.join("\n") + "\n";
}

const INT_RE = /^[-+]?\p{Nd}+$/u;
const FLOAT_RE = /^[-+]?(\p{Nd}+\.\p{Nd}*|\.\p{Nd}+|\p{Nd}+)([eE][-+]?\p{Nd}+)?$/u;

/** `_scalar_in`. Throws SyntaxError (Python: JSONDecodeError) on a bad quoted string. */
export function scalarIn(raw: string): YamlValue {
  let s = pyStrip(raw);
  if (!s) return "";
  if (s[0] === '"') return JSON.parse(s) as YamlValue;
  if (s[0] === "'") return s.slice(1, -1).replace(/''/g, "'");
  if (s[0] === "[") {
    const inner = pyStrip(s.slice(1, -1));
    return inner ? inner.split(",").map(scalarIn) : [];
  }
  const at = s.indexOf(" #");
  if (at >= 0) s = pyRstrip(s.slice(0, at));
  const low = s.toLowerCase();
  if (low === "true" || low === "yes" || low === "on") return true;
  if (low === "false" || low === "no" || low === "off") return false;
  if (low === "null" || low === "~") return null;
  if (INT_RE.test(s)) return Number(asciiDigits(s));
  if (FLOAT_RE.test(s)) return new PyFloat(Number(asciiDigits(s)));
  return s;
}

function indent(l: string): number {
  return l.length - l.replace(/^ +/, "").length;
}

const KEYVAL_RE = new RegExp(`^([A-Za-z_][A-Za-z0-9_]*):(?:[${PY_WS}]+([^\\n]*))?$`);

/** `_parse`: text -> {key: value | [flat mapping, …]}. */
export function parseYaml(text: string): Record<string, YamlValue> {
  const rawLines = pySplitlines(text).map(pyRstrip);
  const lines: [number, string][] = rawLines
    .map((l, n): [number, string] => [n + 1, l])
    .filter(([, l]) => pyStrip(l) && !pyLstrip(l).startsWith("#"));
  const root: Record<string, YamlValue> = {};
  let i = 0;

  const value = (rawIn: string, base: number, jIn: number): [YamlValue, number] => {
    let j = jIn;
    const raw = pyStrip(rawIn);
    if ((raw[0] === "|" || raw[0] === ">") && [...raw.slice(1)].every((c) => c === "-" || c === "+")) {
      let body: string[] = [];
      let first: number | null = null;
      let last = 0;
      while (j < lines.length && indent((lines[j] as [number, string])[1]) > base) {
        const n = (lines[j] as [number, string])[0];
        if (first === null) first = n;
        last = n;
        j += 1;
      }
      if (first !== null) body = rawLines.slice(first - 1, last);
      const ind = body.filter((b) => pyStrip(b)).map(indent);
      const pad = ind.length ? Math.min(...ind) : 0;
      body = body.map((b) => b.slice(pad));
      const s = raw[0] === "|" ? body.join("\n") : body.map(pyStrip).join(" ");
      return [raw.endsWith("-") ? s : s + "\n", j];
    }
    return [scalarIn(raw), j];
  };

  const keyval = (l: string, n: number): [string, string] => {
    const m = KEYVAL_RE.exec(pyStrip(l));
    if (!m) throw new YamlError(`line ${n}: expected \`key: value\`, got ${pyRepr(pyStrip(l))}`);
    return [m[1] as string, m[2] || ""];
  };

  const setKey = (o: Record<string, YamlValue>, k: string, v: YamlValue) => {
    Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
  };

  while (i < lines.length) {
    const [n, l] = lines[i] as [number, string];
    if (indent(l)) throw new YamlError(`line ${n}: unexpected indentation`);
    const [key, raw] = keyval(l, n);
    i += 1;
    if (raw) {
      const [v, j] = value(raw, 0, i);
      setKey(root, key, v);
      i = j;
      continue;
    }
    const items: YamlValue[] = [];
    while (i < lines.length && indent((lines[i] as [number, string])[1]) > 0) {
      const [n2, l2] = lines[i] as [number, string];
      if (!pyLstrip(l2).startsWith("- ")) throw new YamlError(`line ${n2}: expected a \`- \` list item`);
      const itemIndent = indent(l2) + 2;
      const [k, r] = keyval(pyLstrip(l2).slice(2), n2);
      const item: Record<string, YamlValue> = {};
      let [v, j] = value(r, itemIndent, i + 1);
      setKey(item, k, v);
      i = j;
      while (
        i < lines.length &&
        indent((lines[i] as [number, string])[1]) >= itemIndent &&
        !pyLstrip((lines[i] as [number, string])[1]).startsWith("- ")
      ) {
        const [n3, l3] = lines[i] as [number, string];
        const [k3, r3] = keyval(l3, n3);
        [v, j] = value(r3, indent(l3), i + 1);
        setKey(item, k3, v);
        i = j;
      }
      items.push(item);
    }
    setKey(root, key, items);
  }
  return root;
}

function text(v: unknown): string {
  return v === null || v === undefined ? "" : pyStr(v);
}

function intOr(v: unknown, def: number): number {
  return isPyInt(v) && v > 0 ? v : def;
}

function get(d: unknown, key: string, def: unknown = undefined): unknown {
  return isPlainObject(d) && Object.prototype.hasOwnProperty.call(d, key) ? d[key] : def;
}

/** Python iteration over `x or []`: a list, a string's characters, nothing for falsy values. */
function iter(v: unknown): unknown[] {
  if (!truthy(v)) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === "string") return Array.from(v);
  throw new YamlError(`expected a list, got ${pyRepr(v)}`);
}

/** `from_yaml`: YAML text -> [Workflow, warnings]. Throws YamlError on text it can't read. */
export function fromYaml(src: string): [Workflow, string[]] {
  let d: Record<string, YamlValue>;
  try {
    d = parseYaml(src);
  } catch (e) {
    if (e instanceof YamlError) throw e;
    throw new YamlError(e instanceof Error ? e.message : String(e));
  }
  const warnings: string[] = [];
  const blocks: Block[] = [];
  const seen = new Set<string>();
  for (const b of iter(d.blocks)) {
    if (!isPlainObject(b)) throw new YamlError(`expected a mapping, got ${pyRepr(b)}`);
    const bid = pyStr(get(b, "id", ""));
    const kind = b.type;
    if (!bid || seen.has(bid) || !oneOf(["stage", "prompt", "intentions", "function"], kind)) {
      warnings.push(`Skipped a block with a missing/duplicate id or unknown type: ${bid || "?"}`);
      continue;
    }
    if (kind === "intentions" && blocks.some((x) => x.type === "intentions")) {
      warnings.push(`Skipped a second intentions block: ${bid}`);
      continue;
    }
    seen.add(bid);
    const when = typeof b.when === "string" ? pyStrip(b.when) : "";
    let nb: Block;
    if (kind === "intentions") {
      nb = { ...blockSettings(b), id: bid, type: "intentions" };
    } else if (kind === "stage") {
      nb = { id: bid, type: "stage", name: text(b.name), prompt: text(b.prompt) };
      if (hasKey(TEMPLATES, b.template)) nb.template = b.template;
      if (b.read_only === true) nb.read_only = true;
      if (oneOf(STAGE_MODELS, b.model)) nb.model = b.model;
      else if (truthy(b.model)) warnings.push(`Ignored unknown model ${pyRepr(b.model)} on stage ${bid}`);
    } else if (kind === "function") {
      const params = Array.isArray(b.params) ? b.params : [];
      nb = {
        id: bid,
        type: "function",
        name: pyStrip(text(b.name)),
        params: params.map((x) => pyStrip(pyStr(x))).filter((x) => x),
        text: text(b.text),
      };
      if (oneOf(STAGE_MODELS, b.model)) nb.model = b.model;
      else if (truthy(b.model)) warnings.push(`Ignored unknown model ${pyRepr(b.model)} on function ${bid}`);
    } else {
      nb = { id: bid, type: "prompt", text: text(b.text) };
    }
    if (when && kind !== "intentions") nb.when = when;
    blocks.push(nb);
  }
  const pars: Parallel[] = iter(d.parallels).map((p) => ({
    id: pyStr(get(p, "id", "")),
    blocks: iter(get(p, "blocks")).map(pyStr),
    join: get(p, "join", "all"),
  }));
  const loops: Loop[] = iter(d.loops).map((l) => {
    const target = get(l, "target");
    return {
      ...LOOP_DEFAULTS,
      id: pyStr(get(l, "id", "")),
      blocks: iter(get(l, "blocks")).map(pyStr),
      agentic: truthy(get(l, "agentic", true)),
      mode: oneOf(["count", "reward"], get(l, "mode")) ? (get(l, "mode") as string) : "count",
      count: intOr(get(l, "count"), LOOP_DEFAULTS.count),
      max_passes: intOr(get(l, "max_passes"), LOOP_DEFAULTS.max_passes),
      target: isPyNumber(target) ? numberValue(target) : LOOP_DEFAULTS.target,
      reward: text(get(l, "reward")),
      metric: text(get(l, "metric")),
    };
  });
  const ws: Record<string, unknown> = {};
  for (const k of Object.keys(WORKSPACE)) if (Object.prototype.hasOwnProperty.call(d, k)) ws[k] = d[k];
  const clean = cleanWorkspace(ws);
  const bad = Object.keys(ws).filter((k) => !(k in clean));
  if (bad.length) warnings.push("Ignored workspace setting(s) with unknown values: " + bad.join(", "));
  const ocRaw = Array.isArray(d.on_cancel) ? d.on_cancel : [];
  const onCancel = {
    grace_minutes: d.cancel_grace_minutes,
    stages: (ocRaw as unknown[]).filter(isPlainObject).map((s) => ({ name: text(s.name), prompt: text(s.prompt), model: s.model })),
  };
  const wf = new Workflow({
    name: truthy(d.name) ? d.name : "untitled",
    goal: text(d.goal),
    blocks,
    parallels: pars,
    loops,
    workspace: ws,
    on_cancel: onCancel,
    flags: iter(d.flags),
  });
  const dropped = pars.length - wf.parallels.length + loops.length - wf.loops.length;
  if (dropped) warnings.push(`Dropped ${dropped} parallel group(s)/loop(s) that broke the grouping rules.`);
  return [wf, [...warnings, ...wf.callProblems(), ...wf.flagProblems()]];
}
