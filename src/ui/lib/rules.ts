// The Python app's enable rules for the rail controls, as pure functions.
import { INLINE_OVERRIDES, TOGGLE_TEXT, type ToggleKey } from "../../core";

/**
 * Options that only make sense on top of another: Recon fans out over the workers (the Python app's own
 * rule), and the dashboard shows the progress reports, so without them there is nothing to
 * show. The How to work board draws each as a node after the one it needs.
 */
export const TOGGLE_NEEDS: Partial<Record<ToggleKey, ToggleKey>> = { recon: "workers", dashboard: "progress", review_loop: "review" };

/** Turning one of these off turns its dependants off too (the prompt never asks for a dashboard
 *  of progress reports it no longer sends). Recon keeps the Python app's behaviour: it stays ticked and
 *  the core leaves it out while workers is off. */
export const DROPS_WITH: Partial<Record<ToggleKey, ToggleKey[]>> = { progress: ["dashboard"], review: ["review_loop"] };

/** Why a toggle can't be changed right now, or null when it can (the Python app `_toggle_with_model`). */
export function toggleBlocked(key: ToggleKey, toggles: Record<ToggleKey, boolean>): string | null {
  if (INLINE_OVERRIDES.includes(key) && toggles.inline) return "Off while Inline agent only is on";
  const need = TOGGLE_NEEDS[key];
  if (need && !toggles[need]) return `Needs ${TOGGLE_TEXT[need][0]}`;
  return null;
}

/** Which sub-options are live, from the Python app's `_superpowers_toggle`, `_inline_toggle`, etc. */
export function optionsEnabled(t: Record<ToggleKey, boolean>, mockHint: boolean) {
  const fanOut = !t.inline;
  return {
    spec_only: t.superpowers,
    worker_model: fanOut && t.workers,
    recon_model: fanOut && t.workers && t.recon,
    recon_count: fanOut && t.workers && t.recon,
    review_loop: t.review && t.review_loop,
    inline_keep: t.inline,
    progress: t.progress,
    mocks: t.mocks,
    mock_strength: t.mocks && mockHint,
  };
}

/** The Python app's entry validatecommand: empty, or at most `digits` digits. */
export function digitsOk(value: string, digits: number): boolean {
  return value === "" || (/^[0-9]+$/.test(value) && value.length <= digits);
}

type OptionKey = keyof ReturnType<typeof optionsEnabled>;

/** A card's title, as it reads under How to work. */
const card = (k: ToggleKey): string => TOGGLE_TEXT[k][0];

/**
 * Why each greyed-out sub-option is off, in the words of the card it hangs on ("Needs
 * Superpowers", "Off while Inline agent only is on"); null when the option is live. The
 * Settings panel prints it beside the option, so the reason is never a hover away.
 */
export function optionNeeds(t: Record<ToggleKey, boolean>, mockHint: boolean): Record<OptionKey, string | null> {
  const en = optionsEnabled(t, mockHint);
  const inlineOff = `Off while ${card("inline")} is on`;
  const why = (k: OptionKey, reason: string): string | null => (en[k] ? null : reason);
  return {
    spec_only: why("spec_only", `Needs ${card("superpowers")}`),
    worker_model: why("worker_model", t.inline ? inlineOff : `Needs ${card("workers")}`),
    recon_model: why("recon_model", t.inline ? inlineOff : !t.workers ? `Needs ${card("workers")}` : `Needs ${card("recon")}`),
    recon_count: why("recon_count", t.inline ? inlineOff : !t.workers ? `Needs ${card("workers")}` : `Needs ${card("recon")}`),
    review_loop: why("review_loop", !t.review ? `Needs ${card("review")}` : `Needs ${card("review_loop")}`),
    inline_keep: why("inline_keep", `Needs ${card("inline")}`),
    progress: why("progress", `Needs ${card("progress")}`),
    mocks: why("mocks", `Needs ${card("mocks")}`),
    mock_strength: why("mock_strength", !t.mocks ? `Needs ${card("mocks")}` : "Needs Hint deviation"),
  };
}
