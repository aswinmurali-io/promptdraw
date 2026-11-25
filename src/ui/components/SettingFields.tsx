// Small form pieces shared by the Settings panel and the How to work panel's option settings.
import { useId } from "react";
import { Icon } from "./Icon";
import "../styles/properties.css";

export function Check({ label, need, checked, disabled, onChange }: { label: string; need?: string | null; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  const why = disabled ? need : null;
  return (
    <div className="check-row">
      <label className="check" data-disabled={!!disabled}>
        <input type="checkbox" checked={checked} disabled={disabled} aria-describedby={why ? id : undefined} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
      <Need id={id} text={why} block />
    </div>
  );
}

/** Why an option is greyed out, printed beside it: a lock and the card it needs. */
export function Need({ id, text, block }: { id?: string; text?: string | null; block?: boolean }) {
  if (!text) return null;
  return (
    <span id={id} className={"opt-need" + (block ? " opt-need--block" : "")}>
      <Icon name="lock" size={12} />
      {text}
    </span>
  );
}

export function FallbackHint({ id, show, text }: { id: string; show: boolean; text: string }) {
  return (
    <p id={id} className="field-hint" hidden={!show}>
      {text}
    </p>
  );
}
