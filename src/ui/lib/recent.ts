// Recently run palette commands (a per-viewer convenience, so plain localStorage).
export const RECENT_KEY = "promptdraw:recent-commands";
const RECENT_MAX = 5;

export function loadRecent(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function saveRecent(id: string): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...loadRecent().filter((x) => x !== id)].slice(0, RECENT_MAX)));
  } catch {
    // recents are a convenience only
  }
}
