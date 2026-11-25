// Theme mode (the Python app's auto | light | dark). "auto" follows prefers-color-scheme through the
// tokens' media query; light / dark set data-theme on <html>. The mode is mirrored to its own
// storage key so the inline script in index.html can apply it before first paint.
import type { ThemeMode } from "../../core";

export const THEME_KEY = "promptdraw:theme";

export const THEME_LABEL: Record<ThemeMode, string> = { auto: "System", light: "Light", dark: "Dark" };

/** The Python app's header button cycle: auto -> light -> dark -> auto. */
export function nextTheme(mode: ThemeMode): ThemeMode {
  return mode === "auto" ? "light" : mode === "light" ? "dark" : "auto";
}

export function applyTheme(mode: ThemeMode, root: HTMLElement = document.documentElement): void {
  if (mode === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    // storage blocked: the theme still applies for this session
  }
}

/** Whether the page currently renders dark (explicit choice, or system preference on auto). */
export function isDark(mode: ThemeMode): boolean {
  if (mode !== "auto") return mode === "dark";
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}
