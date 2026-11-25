import { describe, expect, it } from "vitest";
import { appDefaults } from "../../core";
import { digitsOk, optionNeeds, optionsEnabled, toggleBlocked } from "./rules";

describe("rail rules", () => {
  it("validates digit entries like the Tk validatecommand", () => {
    expect(digitsOk("", 3)).toBe(true);
    expect(digitsOk("120", 3)).toBe(true);
    expect(digitsOk("1200", 3)).toBe(false);
    expect(digitsOk("1a", 3)).toBe(false);
    expect(digitsOk("-2", 3)).toBe(false);
  });

  it("locks fan-out under inline and recon behind workers", () => {
    const t = { ...appDefaults().toggles };
    expect(toggleBlocked("recon", t)).toMatch(/Multiple workers/);
    t.workers = true;
    expect(toggleBlocked("recon", t)).toBeNull();
    t.inline = true;
    expect(toggleBlocked("workers", t)).toMatch(/Inline/);
    expect(toggleBlocked("tests", t)).toBeNull();
  });

  it("enables sub-options only under their toggle", () => {
    const t = { ...appDefaults().toggles, workers: true, recon: true, mocks: true };
    expect(optionsEnabled(t, false)).toMatchObject({ worker_model: true, recon_model: true, mocks: true, mock_strength: false, spec_only: false });
    expect(optionsEnabled({ ...t, inline: true }, true)).toMatchObject({ worker_model: false, recon_model: false, inline_keep: true, mock_strength: true });
  });

  it("says why each greyed-out option is off, in the cards' own words", () => {
    const t = { ...appDefaults().toggles };
    for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] = false;
    const off = optionNeeds(t, false);
    expect(off.spec_only).toBe("Needs Superpowers");
    expect(off.worker_model).toBe("Needs Multiple workers");
    expect(off.recon_model).toBe("Needs Multiple workers");
    t.workers = true;
    expect(optionNeeds(t, false).worker_model).toBeNull();
    expect(optionNeeds(t, false).recon_model).toBe("Needs Recon via workers");
    t.inline = true;
    expect(optionNeeds(t, false).worker_model).toBe("Off while Inline agent only is on");
    expect(optionNeeds(t, false).inline_keep).toBeNull();
    t.mocks = true;
    expect(optionNeeds(t, false).mock_strength).toBe("Needs Hint deviation");
    expect(optionNeeds(t, true).mock_strength).toBeNull();
  });
});
