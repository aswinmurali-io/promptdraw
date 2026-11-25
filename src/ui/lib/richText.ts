// Rich stage-text helpers (the Python app StageBuilder `_render_rich` / `_delete_use`): find the
// [[Function: …]] calls, {{FILL_INS}}, bare CONSTANT_NAMES and **bold** runs in a stage prompt, plus the Markdown a
// prompt is written in (`code`, ``` fences, # headings, list markers), and delete a whole call
// with one Backspace or Delete. Display only: the stored text is never changed.
import { callRe } from "../../core";

export type RichKind = "plain" | "call" | "flag" | "fill" | "stars" | "bold" | "code" | "fence" | "fenceMark" | "heading" | "list" | "const";
export interface RichPart {
  kind: RichKind;
  text: string;
}

/** The Python app's fill-in pattern: {{ followed by a capital, no braces inside. */
const FILL = /\{\{[A-Z][^{}]*\}\}/g;
/** An A/B marker (flags.ts): `{{#if …}}`, `{{#elif …}}`, `{{#else}}`, `{{/if}}` and `{{@flag}}`. */
const FLAG = /\{\{[ \t]*(?:#if|#elif|#else|\/if|@[a-z][a-z0-9_]*)\b[^}\n]*\}\}/g;
/** A bare SNAKE_CASE constant (TARGET_KIND, MAX_RETRIES): capitals and digits with at least one underscore. */
const CONST = /(?<![\w{])[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+(?![\w}])/g;
const BOLD = /\*\*([^*\n]+)\*\*/g;
const CODE = /`[^`\n]+`/g;
const HEADING = /^#{1,6}[ \t][^\n]*/gm;
const LIST = /^[ \t]*(?:[-*+]|\d+[.)])(?=[ \t])/gm;
/** A fence line: up to three spaces, then three or more backticks. */
const FENCE_LINE = /^ {0,3}```/;

type SpanKind = "call" | "flag" | "fill" | "bold" | "code" | "heading" | "list" | "const";
interface Span {
  start: number;
  end: number;
  kind: SpanKind;
}

function spans(re: RegExp, text: string, kind: SpanKind): Span[] {
  const out: Span[] = [];
  for (const m of text.matchAll(re)) out.push({ start: m.index, end: m.index + m[0].length, kind });
  return out;
}

/** ``` fenced blocks as [start, end) ranges, fence lines included; an unclosed fence runs to the end. */
export function fenceRanges(text: string): { start: number; end: number; open: number; close: number | null }[] {
  const out: { start: number; end: number; open: number; close: number | null }[] = [];
  let at = 0;
  let open: number | null = null;
  while (at <= text.length) {
    const nl = text.indexOf("\n", at);
    const end = nl < 0 ? text.length : nl;
    if (FENCE_LINE.test(text.slice(at, end))) {
      if (open === null) open = at;
      else {
        out.push({ start: open, end, open, close: at });
        open = null;
      }
    }
    if (nl < 0) break;
    at = nl + 1;
  }
  if (open !== null) out.push({ start: open, end: text.length, open, close: null });
  return out;
}

/**
 * Split `text` into highlight parts whose texts join back to `text`. Calls are found first and
 * stay chips everywhere; ``` fenced blocks come next (their fence lines are `fenceMark`, the
 * body `fence`); elsewhere a line's heading or list marker, then `code`, fill-ins, constants and bold.
 * Code wins over bold it overlaps, a fill-in shows through code, and `**x**` becomes stars,
 * bold, stars.
 */
export function richParts(text: string): RichPart[] {
  const fences = fenceRanges(text);
  const inFence = (s: Span) => fences.some((f) => s.start < f.end && s.end > f.start);
  const calls = spans(callRe(), text, "call");
  const code = spans(CODE, text, "code").filter((s) => !inFence(s));
  const overlapsCode = (s: Span) => code.some((c) => s.start < c.end && s.end > c.start);
  const marks = [
    ...spans(HEADING, text, "heading"),
    ...spans(LIST, text, "list"),
    ...code,
    ...spans(FLAG, text, "flag"),
    ...spans(FILL, text, "fill"),
    ...spans(CONST, text, "const"),
    ...spans(BOLD, text, "bold").filter((s) => !overlapsCode(s)),
  ].filter((s) => !inFence(s) && !calls.some((c) => s.start < c.end && s.end > c.start));
  const parts: RichPart[] = [];
  const push = (kind: RichKind, t: string) => {
    if (!t) return;
    const last = parts[parts.length - 1];
    if (last && last.kind === kind && kind !== "stars") last.text += t;
    else parts.push({ kind, text: t });
  };

  // Plain stretches between calls: fences first, then the inline marks.
  const plain = (from: number, to: number) => {
    let at = from;
    for (const f of fences) {
      if (f.end <= at || f.start >= to) continue;
      inline(Math.max(at, from), Math.min(f.start, to));
      fenced(f, Math.max(f.start, at), Math.min(f.end, to));
      at = Math.min(f.end, to);
    }
    inline(at, to);
  };

  const fenced = (f: (typeof fences)[number], from: number, to: number) => {
    const openEnd = text.indexOf("\n", f.open);
    const marksAt: [number, number][] = [[f.open, openEnd < 0 ? text.length : openEnd]];
    if (f.close !== null) marksAt.push([f.close, f.end]);
    let at = from;
    for (const [s, e] of marksAt) {
      if (e <= at || s >= to) continue;
      body(at, Math.max(at, s));
      push("fenceMark", text.slice(Math.max(s, at), Math.min(e, to)));
      at = Math.min(e, to);
    }
    body(at, to);
  };

  // Inside code: fill-ins still show, the rest is `kind`.
  const withFills = (kind: "code" | "fence", from: number, to: number) => {
    let at = from;
    for (const m of text.slice(from, to).matchAll(FILL)) {
      push(kind, text.slice(at, from + m.index));
      push("fill", m[0]);
      at = from + m.index + m[0].length;
    }
    push(kind, text.slice(at, to));
  };
  const body = (from: number, to: number) => withFills("fence", from, to);

  const inline = (from: number, to: number) => {
    if (to <= from) return;
    const inside = marks.filter((s) => s.start >= from && s.end <= to);
    inside.sort((a, b) => a.start - b.start || RANK[a.kind] - RANK[b.kind]);
    let at = from;
    for (const s of inside) {
      if (s.start < at) continue; // overlaps an earlier span
      push("plain", text.slice(at, s.start));
      const t = text.slice(s.start, s.end);
      if (s.kind === "bold") {
        parts.push({ kind: "stars", text: "**" });
        push("bold", t.slice(2, -2));
        parts.push({ kind: "stars", text: "**" });
      } else if (s.kind === "code") withFills("code", s.start, s.end);
      else push(s.kind, t);
      // A heading line's marks stop at its end; a list marker only covers the marker.
      at = s.end;
    }
    push("plain", text.slice(at, to));
  };

  let at = 0;
  for (const call of calls) {
    plain(at, call.start);
    parts.push({ kind: "call", text: text.slice(call.start, call.end) });
    at = call.end;
  }
  plain(at, text.length);
  return parts;
}

/** Which span wins when two start together. */
const RANK: Record<SpanKind, number> = { heading: 0, list: 1, code: 2, flag: 2.5, fill: 3, const: 4, bold: 5, call: 6 };

/**
 * Backspace right after a call (`before`), or Delete right before one, removes the whole
 * call. Returns the new text and caret, or null when the key should act normally (a
 * selection, or the caret is not at a call's edge).
 */
export function deleteCall(text: string, selStart: number, selEnd: number, before: boolean): { text: string; caret: number } | null {
  if (selStart !== selEnd) return null;
  for (const m of text.matchAll(callRe())) {
    const start = m.index;
    const end = start + m[0].length;
    if (before ? selStart === end : selStart === start) return { text: text.slice(0, start) + text.slice(end), caret: start };
  }
  return null;
}
