// Keyboard shortcut specs: matching against KeyboardEvents and display labels.

export interface KeySpec {
  /** KeyboardEvent.key, compared case-insensitively (e.g. "k", "/", "Enter", "1"). */
  key: string;
  /** Ctrl on Windows/Linux, Cmd on macOS. */
  mod?: boolean;
  /** The Ctrl key itself on every platform (a habit alias, e.g. Ctrl+K on a Mac). */
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** KeyboardEvent.code alternative, for keys whose `key` changes with Alt/Shift (e.g. "KeyD"). */
  code?: string;
}

export function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

export function matches(e: KeyboardEvent, s: KeySpec): boolean {
  if (s.ctrl) {
    if (!e.ctrlKey || e.metaKey) return false;
  } else {
    const mod = isMac() ? e.metaKey : e.ctrlKey;
    if (!!s.mod !== mod) return false;
  }
  if (!!s.alt !== e.altKey) return false;
  if (s.code && e.code === s.code) return !!s.shift === e.shiftKey;
  if (e.key.toLowerCase() !== s.key.toLowerCase()) return false;
  // Printable symbols like "?" already imply Shift; only check Shift for letters, digits and named keys.
  const symbol = s.key.length === 1 && !/[a-z0-9]/i.test(s.key);
  return symbol || !!s.shift === e.shiftKey;
}

const NAMES: Record<string, string> = { Enter: "Enter", Escape: "Esc", "=": "+", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Delete: "Del", Backspace: "⌫" };

export function keyParts(s: KeySpec): string[] {
  const mac = isMac();
  const parts: string[] = [];
  if (s.mod) parts.push(mac ? "⌘" : "Ctrl");
  if (s.ctrl) parts.push(mac ? "⌃" : "Ctrl");
  if (s.alt) parts.push(mac ? "⌥" : "Alt");
  if (s.shift) parts.push(mac ? "⇧" : "Shift");
  const k = NAMES[s.key] ?? (s.key.length === 1 ? s.key.toUpperCase() : s.key);
  parts.push(k);
  return parts;
}

export function keyLabel(s: KeySpec): string {
  return keyParts(s).join(isMac() ? "" : "+");
}

/** True when keystrokes belong to a text field, so bare-key shortcuts must not fire. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit", "range", "reset", "file"].includes(type);
  }
  return false;
}
