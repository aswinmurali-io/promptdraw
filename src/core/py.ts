// Python semantics helpers, so the port of the Python app's Python matches it byte for byte.
// Pure: no DOM, no I/O.
// @lat: [[core#Modules]]

/**
 * A Python `float` read from YAML (or JSON) text. JS numbers lose the int/float
 * distinction, and the Python app cares about it in a few places (`str(5.0)` is "5.0",
 * `isinstance(v, int)` rejects 7.0). Plain JS numbers stand for Python ints when
 * integral and for floats otherwise.
 */
export class PyFloat {
  readonly value: number;
  constructor(value: number) {
    this.value = value;
  }
  toString(): string {
    return pyFloatRepr(this.value);
  }
  valueOf(): number {
    return this.value;
  }
}

/** Characters Python's `str.isspace()` (and `re` `\s` on str) treats as whitespace. */
export const PY_WS = "\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const STRIP_RE = new RegExp(`^[${PY_WS}]+|[${PY_WS}]+$`, "g");
const LSTRIP_RE = new RegExp(`^[${PY_WS}]+`);
const RSTRIP_RE = new RegExp(`[${PY_WS}]+$`);
const SPLIT_RE = new RegExp(`[${PY_WS}]+`);

/** Python `str.strip()` with no argument. */
export function pyStrip(s: string): string {
  return s.replace(STRIP_RE, "");
}

export function pyLstrip(s: string): string {
  return s.replace(LSTRIP_RE, "");
}

export function pyRstrip(s: string): string {
  return s.replace(RSTRIP_RE, "");
}

/** Python `str.split()` with no argument: whitespace runs, no empty parts. */
export function pySplit(s: string): string[] {
  return s.split(SPLIT_RE).filter((x) => x !== "");
}

/** Python `str.splitlines()`: every Python line boundary, no trailing empty element. */
export function pySplitlines(s: string): string[] {
  const out: string[] = [];
  const re = /\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out.push(s.slice(last, m.index));
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

/** Python truthiness. */
export function truthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === "" || v === 0) return false;
  if (typeof v === "number") return true; // NaN is truthy in Python
  if (v instanceof PyFloat) return v.value !== 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof Map || v instanceof Set) return v.size > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof PyFloat) && !(v instanceof Map);
}

/** Python `isinstance(v, int) and not isinstance(v, bool)`. */
export function isPyInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

/** Python `isinstance(v, (int, float)) and not isinstance(v, bool)`. */
export function isPyNumber(v: unknown): v is number | PyFloat {
  return typeof v === "number" || v instanceof PyFloat;
}

export function numberValue(v: number | PyFloat): number {
  return v instanceof PyFloat ? v.value : v;
}

/** Python `repr(float)`: shortest round-trip digits, sci notation outside 1e-4 <= |x| < 1e16. */
export function pyFloatRepr(x: number): string {
  if (Number.isNaN(x)) return "nan";
  if (x === Infinity) return "inf";
  if (x === -Infinity) return "-inf";
  if (x === 0) return Object.is(x, -0) ? "-0.0" : "0.0";
  const sign = x < 0 ? "-" : "";
  const [mant = "", expStr = "0"] = Math.abs(x).toExponential().split("e");
  const exp = Number(expStr);
  const digits = mant.replace(".", "");
  if (exp < -4 || exp >= 16) {
    const m = digits.length > 1 ? digits[0] + "." + digits.slice(1) : digits;
    const e = Math.abs(exp) < 10 ? "0" + Math.abs(exp) : String(Math.abs(exp));
    return `${sign}${m}e${exp < 0 ? "-" : "+"}${e}`;
  }
  if (exp < 0) return `${sign}0.${"0".repeat(-exp - 1)}${digits}`;
  if (digits.length <= exp + 1) return `${sign}${digits}${"0".repeat(exp + 1 - digits.length)}.0`;
  return `${sign}${digits.slice(0, exp + 1)}.${digits.slice(exp + 1)}`;
}

/** Decimal digits of a Python int stored as a JS number (no exponent notation). */
function intString(n: number): string {
  return Number.isSafeInteger(n) ? String(n) : BigInt(n).toString();
}

/** `fmt_num`: an integral float prints like an int; everything else is `str(v)`. */
export function fmtNum(v: number | PyFloat): string {
  const n = numberValue(v);
  if (Number.isFinite(n) && Number.isInteger(n)) return intString(n);
  return pyFloatRepr(n);
}

const UNPRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u;

function reprString(s: string): string {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (ch === quote || ch === "\\") out += "\\" + ch;
    else if (ch === "\t") out += "\\t";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (cp < 0x20 || cp === 0x7f) out += "\\x" + cp.toString(16).padStart(2, "0");
    else if (cp < 0x7f || ch === " ") out += ch;
    else if (UNPRINTABLE.test(ch)) {
      if (cp < 0x100) out += "\\x" + cp.toString(16).padStart(2, "0");
      else if (cp < 0x10000) out += "\\u" + cp.toString(16).padStart(4, "0");
      else out += "\\U" + cp.toString(16).padStart(8, "0");
    } else out += ch;
  }
  return out + quote;
}

/** Python `repr()` for the value kinds the Python app formats with `{!r}`. */
export function pyRepr(v: unknown): string {
  if (typeof v === "string") return reprString(v);
  if (v === null || v === undefined) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (typeof v === "number") return Number.isInteger(v) ? intString(v) : pyFloatRepr(v);
  if (v instanceof PyFloat) return pyFloatRepr(v.value);
  if (Array.isArray(v)) return "[" + v.map(pyRepr).join(", ") + "]";
  if (v instanceof Map) return "{" + [...v].map(([k, x]) => `${pyRepr(k)}: ${pyRepr(x)}`).join(", ") + "}";
  if (typeof v === "object") {
    return "{" + Object.entries(v as object).map(([k, x]) => `${pyRepr(k)}: ${pyRepr(x)}`).join(", ") + "}";
  }
  return String(v);
}

/** Python `str()`. `None` gives "None" (the Python app's `_text` maps it to "" itself). */
export function pyStr(v: unknown): string {
  if (typeof v === "string") return v;
  return pyRepr(v);
}

/** Unicode decimal digits (`\p{Nd}`) -> ASCII, as Python's `int()` / `float()` accept them. */
export function asciiDigits(s: string): string {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x80 || !/\p{Nd}/u.test(ch)) {
      out += ch;
      continue;
    }
    // Every Nd run is a block of ten starting at its zero.
    let zero = cp;
    while (zero > 0 && /\p{Nd}/u.test(String.fromCodePoint(zero - 1))) zero--;
    out += String((cp - zero) % 10);
  }
  return out;
}

const INT_RE = /^[+-]?\p{Nd}+(?:_\p{Nd}+)*$/u;
const DIGITPART = "\\p{Nd}(?:_?\\p{Nd})*";
const FLOAT_RE = new RegExp(
  `^[+-]?(?:(?:(?:${DIGITPART})?\\.${DIGITPART}|${DIGITPART}\\.?)(?:[eE][+-]?${DIGITPART})?|inf|infinity|nan)$`,
  "iu",
);

/** Python `int(str)`; `null` where Python raises ValueError. */
export function pyIntParse(s: string): number | null {
  const t = pyStrip(s);
  if (!INT_RE.test(t)) return null;
  return Number(asciiDigits(t).replace(/_/g, ""));
}

/** Python `float(str)`; `null` where Python raises ValueError. */
export function pyFloatParse(s: string): number | null {
  const t = pyStrip(s);
  if (!FLOAT_RE.test(t)) return null;
  const low = t.toLowerCase().replace(/^[+-]/, "");
  const neg = t.startsWith("-");
  if (low === "inf" || low === "infinity") return neg ? -Infinity : Infinity;
  if (low === "nan") return NaN;
  return Number(asciiDigits(t).replace(/_/g, ""));
}

/** Python 3 `round(x)`: nearest integer, ties to even. */
export function roundHalfEven(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/**
 * `json.dumps(v, ensure_ascii=...)` for a string. `JSON.stringify` matches
 * `ensure_ascii=False` except for lone surrogates, which Python writes raw.
 */
export function pyJsonString(s: string, ensureAscii = false): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const ch = s[i] ?? "";
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\b") out += "\\b";
    else if (ch === "\f") out += "\\f";
    else if (c < 0x20 || (ensureAscii && c > 0x7e)) out += "\\u" + c.toString(16).padStart(4, "0");
    else out += ch;
  }
  return out + '"';
}

/**
 * `json.dumps(v, indent=indent, ensure_ascii=ensureAscii)` with Python's default
 * separators. Floats that came in as `PyFloat` keep their `.0`.
 */
export function pyJsonDumps(v: unknown, indent: number | null = null, ensureAscii = true, level = 0): string {
  if (v === null || v === undefined) return "null";
  if (v === true) return "true";
  if (v === false) return "false";
  if (typeof v === "string") return pyJsonString(v, ensureAscii);
  if (typeof v === "number") {
    if (Number.isNaN(v)) return "NaN";
    if (!Number.isFinite(v)) return v > 0 ? "Infinity" : "-Infinity";
    return Number.isInteger(v) ? intString(v) : pyFloatRepr(v);
  }
  if (v instanceof PyFloat) {
    const n = v.value;
    if (Number.isNaN(n)) return "NaN";
    if (!Number.isFinite(n)) return n > 0 ? "Infinity" : "-Infinity";
    return pyFloatRepr(n);
  }
  const pad = indent === null ? "" : "\n" + " ".repeat(indent * (level + 1));
  const end = indent === null ? "" : "\n" + " ".repeat(indent * level);
  const sep = indent === null ? ", " : ",";
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    return "[" + v.map((x) => pad + pyJsonDumps(x, indent, ensureAscii, level + 1)).join(sep) + end + "]";
  }
  const entries = v instanceof Map ? [...v] : Object.entries(v as object);
  if (!entries.length) return "{}";
  return (
    "{" +
    entries
      .map(([k, x]) => pad + pyJsonString(String(k), ensureAscii) + ": " + pyJsonDumps(x, indent, ensureAscii, level + 1))
      .join(sep) +
    end +
    "}"
  );
}

/**
 * `json.loads(text)` that keeps Python's int/float split: a number written with a
 * `.` or exponent becomes a `PyFloat` (needs JSON.parse source access, which
 * current browsers and Node have; without it floats stay plain numbers).
 */
export function pyJsonLoads(text: string): unknown {
  return JSON.parse(text, function (this: unknown, _k: string, v: unknown, ctx?: { source?: string }) {
    if (typeof v === "number" && ctx && typeof ctx.source === "string" && /[.eE]/.test(ctx.source)) {
      return new PyFloat(v);
    }
    return v;
  });
}

/** Deep copy of plain JSON-like data (keeps PyFloat instances). */
export function deepClone<T>(v: T): T {
  if (Array.isArray(v)) return v.map(deepClone) as T;
  if (v instanceof PyFloat || v === null || typeof v !== "object") return v;
  if (v instanceof Map) return new Map([...v].map(([k, x]) => [k, deepClone(x)])) as T;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as object)) {
    Object.defineProperty(out, k, { value: deepClone(x), enumerable: true, writable: true, configurable: true });
  }
  return out as T;
}
