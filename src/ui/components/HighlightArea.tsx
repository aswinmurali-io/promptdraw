// An editable textarea with syntax highlighting. The text is drawn by a mirror layer stacked
// behind a transparent textarea in the same grid cell, so both wrap identically and the
// textarea grows with its content; the caret and selection stay native. Highlight styles
// must not change glyph widths (no padding, no real bold in proportional fonts), or the
// caret drifts away from the drawn text.
import type { ReactNode, Ref, TextareaHTMLAttributes } from "react";
import "../styles/highlight.css";

export interface HighlightAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value" | "className"> {
  value: string;
  onChange: (v: string) => void;
  /** Draws `value` with highlight spans; its text content must equal `value`. */
  render: (text: string) => ReactNode;
  /** Classes for the outer box (it carries the field border, background and focus ring). */
  className?: string;
  areaRef?: Ref<HTMLTextAreaElement>;
  /** Test id on the mirror's text, whose textContent is exactly `value`. */
  mirrorTestId?: string;
}

export function HighlightArea({ value, onChange, render, className, areaRef, mirrorTestId, ...rest }: HighlightAreaProps) {
  return (
    <div className={"hl " + (className ?? "")}>
      <div className="hl-mirror" aria-hidden="true">
        <span data-testid={mirrorTestId}>{render(value)}</span>
        {/* Keeps a trailing empty line as tall as the textarea's. */}
        {"​"}
      </div>
      <textarea ref={areaRef} className="hl-input" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  );
}
