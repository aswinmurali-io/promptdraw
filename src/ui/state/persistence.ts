// Local-first persistence. The config is stored as the Python app's own .prompt_builder.json text
// (serializeAppConfig / loadAppConfig), so storage and file export share one format. The
// task text, which the Python app never saves, and per-viewer UI prefs live under their own keys.
// Every access is wrapped: blocked or full storage must never break the app.
// @lat: [[ui#Persistence and files]]
import { useEffect, useRef } from "react";
import { appDefaults, loadAppConfig, serializeAppConfig, type AppConfig } from "../../core";
import { isCheckMode } from "./checkMode";

export const STORAGE_KEYS = {
  config: "promptdraw:config",
  task: "promptdraw:task",
  prefs: "promptdraw:prefs",
  /** When the config was last saved (ms). Written last, so other tabs react to this key. */
  savedAt: "promptdraw:savedAt",
  /** "seen" once the first-visit intro video has been closed. */
  intro: "promptdraw:intro",
} as const;

export const SAVE_DEBOUNCE_MS = 300;

export interface Prefs {
  showProps: boolean;
  showOutput: boolean;
  zoom: number;
  welcomeDismissed: boolean;
  /** How to work closed on the Simple task tab (wide screens; on phones it is a sheet). */
  workClosed: boolean;
}

/** First run: only the prompt panel is open, beside the Task card (the canvas is the product). */
export const DEFAULT_PREFS: Prefs = { showProps: false, showOutput: true, zoom: 100, welcomeDismissed: false, workClosed: false };

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Saved config (validated like the Python app's App.load_config) plus the saved task text. */
export function loadStored(): AppConfig {
  const text = read(STORAGE_KEYS.config);
  const cfg = text === null ? appDefaults() : loadAppConfig(text);
  return { ...cfg, task: read(STORAGE_KEYS.task) ?? "" };
}

/** When the stored config was last saved, or 0 if unknown. */
export function readSavedAt(): number {
  const n = Number(read(STORAGE_KEYS.savedAt));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Save `cfg` and stamp it with a time later than any stamp already stored. */
export function saveStored(cfg: AppConfig): boolean {
  const ok = write(STORAGE_KEYS.config, serializeAppConfig(cfg)) && write(STORAGE_KEYS.task, cfg.task);
  if (ok) write(STORAGE_KEYS.savedAt, String(Math.max(Date.now(), readSavedAt() + 1)));
  return ok;
}

/** The part of a config tabs share: everything but the per-tab view (`tab`) and theme (`mode`). */
export function sharedContent(cfg: AppConfig): string {
  return serializeAppConfig({ ...cfg, tab: "task", mode: "auto" }) + "\u0000" + cfg.task;
}

/** Whether this browser has saved prefs yet (false on the very first visit). */
export function hasPrefs(): boolean {
  return read(STORAGE_KEYS.prefs) !== null;
}

/** Whether the first-visit intro should open: a brand-new browser that has not closed it yet. */
export function introDue(): boolean {
  return !hasPrefs() && read(STORAGE_KEYS.intro) === null;
}

export function markIntroSeen(): void {
  write(STORAGE_KEYS.intro, "seen");
}

export function loadPrefs(): Prefs {
  try {
    const v: unknown = JSON.parse(read(STORAGE_KEYS.prefs) ?? "{}");
    if (!v || typeof v !== "object") return { ...DEFAULT_PREFS };
    const p = v as Partial<Prefs>;
    return {
      showProps: typeof p.showProps === "boolean" ? p.showProps : DEFAULT_PREFS.showProps,
      showOutput: typeof p.showOutput === "boolean" ? p.showOutput : DEFAULT_PREFS.showOutput,
      zoom: typeof p.zoom === "number" && p.zoom >= 50 && p.zoom <= 200 ? Math.round(p.zoom) : DEFAULT_PREFS.zoom,
      welcomeDismissed: p.welcomeDismissed === true,
      workClosed: p.workClosed === true,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(p: Prefs): void {
  write(STORAGE_KEYS.prefs, JSON.stringify(p));
}

/**
 * Autosave `cfg` SAVE_DEBOUNCE_MS after the last change, and immediately when the tab hides
 * or closes. When another tab saves something newer than this tab last saw, and this tab has
 * no unsaved edits of its own, hand that config to `onExternal`. A save that only differs in
 * `tab` or `mode` is ignored, so two tabs on different views never ping-pong.
 */
export function useAutosave(cfg: AppConfig, onExternal: (cfg: AppConfig) => void): void {
  const latest = useRef(cfg);
  const pending = useRef(false);
  const seen = useRef(0);
  const external = useRef(onExternal);
  external.current = onExternal;

  const save = useRef(() => {
    pending.current = false;
    if (saveStored(latest.current)) seen.current = readSavedAt();
  });

  useEffect(() => {
    if (latest.current === cfg) return;
    latest.current = cfg;
    pending.current = true;
    const t = setTimeout(save.current, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [cfg]);

  useEffect(() => {
    seen.current = readSavedAt();
    const flush = () => pending.current && save.current();
    const onVisibility = () => document.visibilityState === "hidden" && flush();
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEYS.savedAt) return;
      const at = Number(e.newValue);
      if (!(at > seen.current)) return; // stale or out-of-order write
      seen.current = at;
      if (pending.current) return; // our own unsaved edits win; they save shortly
      const next = loadStored();
      if (sharedContent(next) === sharedContent(latest.current)) return;
      external.current(next);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", flush);
    // A check-mode page keeps to itself: other tabs' saves never reach it.
    const listen = !isCheckMode();
    if (listen) window.addEventListener("storage", onStorage);
    return () => {
      flush();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", flush);
      if (listen) window.removeEventListener("storage", onStorage);
    };
  }, []);
}
