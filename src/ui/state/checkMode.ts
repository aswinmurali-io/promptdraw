// Check mode (`#wf=<payload>&check`): an agent checks a workflow link in whatever browser it has,
// maybe the user's own profile. Decided once at startup; when on, the page runs on in-memory
// storage, so it neither reads nor writes the user's saved work and other tabs never hear of it.
// @lat: [[ui#Workflow links#Check mode]]
import { parseLinkHash } from "../lib/link";

let checking = false;

/** A `Storage` that lives and dies with the page. */
export class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number {
    return this.data.size;
  }
  clear(): void {
    this.data.clear();
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

/** Swap the page's `localStorage` for a fresh in-memory one. */
export function installMemoryStorage(): void {
  const storage = new MemoryStorage();
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
  if (globalThis !== (window as unknown)) Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
}

/** Decide check mode from the page's fragment; call once, before the app first renders. */
export function initCheckMode(hash: string): boolean {
  checking = parseLinkHash(hash)?.check ?? false;
  if (checking) installMemoryStorage();
  return checking;
}

export function isCheckMode(): boolean {
  return checking;
}
