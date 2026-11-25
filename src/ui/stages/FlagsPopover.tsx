// The stage bar's Flags popover: choose which A/B variant the prompt follows. A toggle per bool
// flag, a text field per text flag, and Embed | Strip for what happens to the variants not
// chosen. Values live in the app config (so they persist and undo like any setting) and the
// canvas and the Prompt panel follow as they change.
// @lat: [[stages#Prompt flags UI]]
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { cleanFlags, type FlagMode } from "../../core";
import { Icon } from "../components/Icon";
import { Check, DraftInput, Field, Radios } from "./fields";
import type { StagesController } from "./useStages";

const MODE_HINT: Record<FlagMode, string> = {
  embed: "Every variant stays in the prompt, labelled, with a line saying which one to follow.",
  strip: "Only the chosen variant is in the prompt; the others are removed.",
};

/** The popover's width and the gap to the press it opened from. */
const POP_W = 352;
const POP_GAP = 14;

export function FlagsPopover({ ctl }: { ctl: StagesController }) {
  const defs = cleanFlags(ctl.workflow.flags);
  const box = useRef<HTMLDivElement>(null);
  const close = ctl.setFlagsOpen;
  const at = ctl.flagsAt;
  const placed = !!at && Number.isFinite(at.x) && Number.isFinite(at.y);
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined);

  // Opened from a tag on the canvas: sit beside the press, on whichever side has the room, inside the window.
  useLayoutEffect(() => {
    if (!at || !placed) return setStyle(undefined);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(8, Math.min(vw - POP_W - 8, at.x - POP_W / 2));
    const below = at.y < vh / 2;
    setStyle(below ? { left, top: Math.min(vh - 120, at.y + POP_GAP) } : { left, bottom: Math.max(8, vh - at.y + POP_GAP) });
  }, [at, placed]);

  // Opened on a flag (a tag's press): that flag's control takes the focus.
  useEffect(() => {
    if (!at?.flag) return;
    const row = box.current?.querySelector<HTMLElement>(`[data-flag="${CSS.escape(at.flag)}"]`);
    row?.querySelector<HTMLElement>("input, button, textarea")?.focus();
  }, [at]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Element) || !t.isConnected) return;
      if (t.closest(".flags-pop, .stage-flags")) return;
      close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [close]);

  const pop = (
    <div ref={box} className={"flags-pop island" + (placed ? " flags-pop--at" : "")} style={placed ? style : undefined} role="dialog" aria-label="Prompt flags" data-at={placed || undefined}>
      <div className="flags-pop-head">
        <h2 className="flags-pop-title">Prompt flags</h2>
        <button type="button" className="icon-btn icon-btn--sm" onClick={() => close(false)} aria-label="Close prompt flags">
          <Icon name="close" size={16} />
        </button>
      </div>
      {defs.length === 0 && <p className="insp-hint">No flags yet. Declare one under Prompt flags on the Goal.</p>}
      {defs.map((f) => {
        const cur = ctl.flags[f.name];
        return (
          <div key={f.name} className="flags-row" data-flag={f.name}>
            {f.type === "bool" ? (
              <Check
                label={
                  <>
                    <span className="flags-name">{f.name}</span>
                    {f.label && <span className="flags-label"> · {f.label}</span>}
                  </>
                }
                checked={typeof cur === "boolean" ? cur : f.default === true}
                onChange={(v) => ctl.setFlag(f.name, v)}
              />
            ) : (
              <Field label={<span className="flags-name">{f.name}</span>} hint={f.label}>
                {(fid) => <DraftInput id={fid} label={f.name} value={typeof cur === "string" ? cur : String(f.default)} onChange={(v) => ctl.setFlag(f.name, v)} />}
              </Field>
            )}
          </div>
        );
      })}
      <Field label="Variants not chosen" hint={MODE_HINT[ctl.flagMode]}>
        {() => (
          <Radios
            name="flag-mode"
            label="Variants not chosen"
            value={ctl.flagMode}
            options={[
              ["embed", "Embed both"],
              ["strip", "Strip the others"],
            ]}
            onChange={(m) => ctl.setFlagMode(m)}
          />
        )}
      </Field>
    </div>
  );
  return placed ? createPortal(pop, document.body) : pop;
}
