import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appDefaults, loadAppConfig, serializeAppConfig, type AppConfig } from "../../core";
import { DEFAULT_PREFS, SAVE_DEBOUNCE_MS, STORAGE_KEYS, loadPrefs, loadStored, readSavedAt, savePrefs, saveStored, useAutosave } from "./persistence";

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

/** Simulate another tab saving `cfg` with stamp `at`. */
function otherTabSaves(cfg: AppConfig, at: number): void {
  localStorage.setItem(STORAGE_KEYS.config, serializeAppConfig(cfg));
  localStorage.setItem(STORAGE_KEYS.task, cfg.task);
  localStorage.setItem(STORAGE_KEYS.savedAt, String(at));
  window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEYS.savedAt, newValue: String(at) }));
}

describe("persistence", () => {
  it("starts from the app defaults when nothing is stored", () => {
    expect(loadStored()).toEqual(appDefaults());
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("stores the config as the Python app JSON and the task separately", () => {
    const cfg = { ...appDefaults(), task: "my task", extra: "notes", worker_model: "opus" as const };
    cfg.toggles = { ...cfg.toggles, workers: true };
    expect(saveStored(cfg)).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.config)).toBe(serializeAppConfig(cfg));
    expect(localStorage.getItem(STORAGE_KEYS.task)).toBe("my task");
    expect(loadStored()).toEqual({ ...loadAppConfig(serializeAppConfig(cfg)), task: "my task" });
    expect(loadStored().toggles.workers).toBe(true);
  });

  it("survives junk in storage", () => {
    localStorage.setItem(STORAGE_KEYS.config, "{not json");
    localStorage.setItem(STORAGE_KEYS.prefs, "[]");
    expect(loadStored()).toEqual(appDefaults());
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("round-trips and clamps prefs", () => {
    savePrefs({ showProps: false, showOutput: true, zoom: 130, welcomeDismissed: true, workClosed: true });
    expect(loadPrefs()).toEqual({ showProps: false, showOutput: true, zoom: 130, welcomeDismissed: true, workClosed: true });
    localStorage.setItem(STORAGE_KEYS.prefs, JSON.stringify({ zoom: 9000 }));
    expect(loadPrefs().zoom).toBe(100);
  });

  it("stamps each save later than the last", () => {
    localStorage.setItem(STORAGE_KEYS.savedAt, String(Date.now() + 60_000));
    const before = readSavedAt();
    saveStored(appDefaults());
    expect(readSavedAt()).toBeGreaterThan(before);
  });
});

describe("useAutosave across tabs", () => {
  it("applies a newer save from another tab", () => {
    const onExternal = vi.fn();
    renderHook(() => useAutosave(appDefaults(), onExternal));
    otherTabSaves({ ...appDefaults(), task: "from B" }, 10);
    expect(onExternal).toHaveBeenCalledTimes(1);
    expect(onExternal).toHaveBeenCalledWith(expect.objectContaining({ task: "from B" }));
  });

  it("ignores an older or same-stamp save", () => {
    const onExternal = vi.fn();
    renderHook(() => useAutosave(appDefaults(), onExternal));
    otherTabSaves({ ...appDefaults(), task: "new" }, 20);
    otherTabSaves({ ...appDefaults(), task: "old" }, 15);
    otherTabSaves({ ...appDefaults(), task: "same" }, 20);
    expect(onExternal).toHaveBeenCalledTimes(1);
  });

  it("ignores a save that only changes the view or theme", () => {
    const onExternal = vi.fn();
    renderHook(() => useAutosave(appDefaults(), onExternal));
    otherTabSaves({ ...appDefaults(), tab: "stages", mode: "dark" }, 10);
    expect(onExternal).not.toHaveBeenCalled();
  });

  it("does not overwrite unsaved local edits, and saves them after the delay", () => {
    vi.useFakeTimers();
    const onExternal = vi.fn();
    const { rerender } = renderHook(({ cfg }) => useAutosave(cfg, onExternal), { initialProps: { cfg: appDefaults() } });
    rerender({ cfg: { ...appDefaults(), task: "typing" } });
    otherTabSaves({ ...appDefaults(), task: "from B" }, 10);
    expect(onExternal).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(SAVE_DEBOUNCE_MS));
    expect(loadStored().task).toBe("typing");
    expect(readSavedAt()).toBeGreaterThan(10);
  });
});
