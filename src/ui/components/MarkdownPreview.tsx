// A read-only Markdown view of a stage prompt: ``` fences as code blocks, `#` headings, list
// items with hanging markers, and inline `code`, **bold**, [[calls]] and {{FILL_INS}} drawn the
// way the editor marks them. Each source line stays its own block (prompts are written line
// by line), and blank lines become small gaps. Display only: the text is never rewritten.
import type { ReactNode } from "react";
import { fenceRanges, richParts } from "../lib/richText";
import "../styles/markdown.css";

export function MarkdownPreview({ text, empty, className }: { text: string; empty?: string; className?: string }) {
  return <div className={"md-preview " + (className ?? "")}>{text.trim() ? blocks(text) : <p className="md-empty">{empty ?? "Nothing written yet."}</p>}</div>;
}

function blocks(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let at = 0;
  for (const f of fenceRanges(text)) {
    out.push(...lines(text.slice(at, f.open).replace(/\n$/, ""), at));
    const openEnd = text.indexOf("\n", f.open);
    const lang = text.slice(f.open, openEnd < 0 ? text.length : openEnd).replace(/^ *```/, "").trim();
    const bodyStart = openEnd < 0 ? text.length : openEnd + 1;
    const bodyEnd = f.close === null ? text.length : Math.max(bodyStart, f.close - 1);
    out.push(
      <pre key={`f${f.open}`} className="md-pre" data-lang={lang || undefined}>
        <code>{inline(text.slice(bodyStart, bodyEnd), true)}</code>
      </pre>,
    );
    at = f.end + 1;
  }
  if (at <= text.length) out.push(...lines(text.slice(at), at));
  return out;
}

function lines(chunk: string, offset: number): ReactNode[] {
  if (!chunk) return [];
  let pos = offset;
  return chunk.split("\n").map((line) => {
    const key = pos;
    pos += line.length + 1;
    if (!line.trim()) return <div key={key} className="md-gap-line" aria-hidden="true" />;
    const h = /^(#{1,6})[ \t]+(.*)$/.exec(line);
    if (h) {
      return (
        <div key={key} className={"md-heading md-heading--" + Math.min(3, h[1]!.length)} role="heading" aria-level={Math.min(6, h[1]!.length + 1)}>
          {inline(h[2]!)}
        </div>
      );
    }
    const item = /^([ \t]*)([-*+]|\d+[.)])[ \t]+(.*)$/.exec(line);
    if (item) {
      const [, indent, marker, rest] = item as unknown as [string, string, string, string];
      return (
        <div key={key} className="md-item" style={indent ? { marginLeft: `${indent.replace(/\t/g, "  ").length * 0.5}em` } : undefined}>
          <span className="md-marker">{/^[-*+]$/.test(marker) ? "•" : marker}</span>
          <span>{inline(rest)}</span>
        </div>
      );
    }
    return (
      <p key={key} className="md-p">
        {inline(line)}
      </p>
    );
  });
}

/** Inline marks without their Markdown syntax (backticks, `**`); calls and fill-ins as in the editor. */
function inline(text: string, inCode = false): ReactNode[] {
  const parts = inCode ? richParts(text).map((p) => (p.kind === "call" || p.kind === "fill" ? p : { kind: "plain" as const, text: p.text })) : richParts(text);
  return parts.map((p, i) => {
    switch (p.kind) {
      case "code": {
        const body = p.text.replace(/^`|`$/g, "");
        return body ? (
          <code key={i} className="md-code">
            {body}
          </code>
        ) : null;
      }
      case "bold":
        return <strong key={i}>{p.text}</strong>;
      case "stars":
        return null;
      case "call":
        return (
          <span key={i} className="hl-call">
            {p.text}
          </span>
        );
      case "const":
        return (
          <span key={i} className="hl-const">
            {p.text}
          </span>
        );
      case "flag":
        return (
          <span key={i} className="hl-flag">
            {p.text}
          </span>
        );
      case "fill":
        return (
          <span key={i} className="hl-fill">
            {p.text}
          </span>
        );
      default:
        return p.text;
    }
  });
}
