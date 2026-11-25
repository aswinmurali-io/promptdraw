import { describe, expect, it } from "vitest";
import { appDefaults, type ToggleKey } from "../../core";
import { reducer, initialState } from "../state/store";
import { laneRows } from "./intentGroups";
import { toggleBlocked } from "./rules";

const on = (...keys: ToggleKey[]) => ({ ...appDefaults().toggles, ...Object.fromEntries(keys.map((k) => [k, true])) });
const shape = (t: Record<ToggleKey, boolean>) => laneRows(t).map((r) => r.map((n) => n.key + (n.locked ? "!" : "")));

describe("option rows on the board", () => {
  it("chains an option after the one it needs, and keeps the panel's order", () => {
    expect(shape(on("tests", "workers", "recon", "progress", "dashboard"))).toEqual([["workers", "recon"], ["tests"], ["progress", "dashboard"]]);
  });

  it("locks what Inline agent only switches off, still chained", () => {
    expect(shape(on("workers", "recon", "inline"))).toEqual([["workers!", "recon!"], ["inline"]]);
  });

  it("starts a locked row for an option whose need is not ticked", () => {
    expect(shape(on("recon"))).toEqual([["recon!"]]);
    expect(shape(on("dashboard"))).toEqual([["dashboard!"]]);
  });
});

describe("Basic dashboard needs Progress reports", () => {
  it("is locked until progress is on", () => {
    expect(toggleBlocked("dashboard", on())).toBe("Needs Progress reports");
    expect(toggleBlocked("dashboard", on("progress"))).toBeNull();
  });

  it("goes off with progress; recon stays ticked when workers goes off, as in the Python app", () => {
    let s = initialState({ ...appDefaults(), toggles: on("progress", "dashboard", "workers", "recon") });
    s = reducer(s, { type: "toggle", key: "progress", on: false });
    expect(s.cfg.toggles.dashboard).toBe(false);
    s = reducer(s, { type: "toggle", key: "workers", on: false });
    expect(s.cfg.toggles.recon).toBe(true);
  });
});
