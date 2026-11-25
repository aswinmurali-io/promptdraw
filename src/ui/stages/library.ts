// The browser's stand-in for the Python app's workflows/ folder: saved workflow YAML keyed by the
// slugified name (`<slug>.yaml`), newest first. Text is the Python app's own to_yaml output, so an
// entry exports to exactly the file the Tk app would have written. All storage access is
// wrapped: blocked or full storage just means an empty library.
// @lat: [[stages#Workflow library]]
import { YamlError, fromYaml, slug, toYaml } from "../../core";

export const LIBRARY_KEY = "promptdraw:workflows";

export interface LibraryEntry {
  name: string;
  yaml: string;
  savedAt: number;
}

type Store = Record<string, { yaml: string; savedAt: number }>;

function readAll(): Store {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Store = {};
    for (const [k, e] of Object.entries(v as Record<string, unknown>)) {
      const r = e as { yaml?: unknown; savedAt?: unknown };
      if (r && typeof r.yaml === "string") out[k] = { yaml: r.yaml, savedAt: typeof r.savedAt === "number" ? r.savedAt : 0 };
    }
    return out;
  } catch {
    return {};
  }
}

/** Saved workflows, most recently saved first (the Python app sorts the folder by mtime). */
export function listLibrary(): LibraryEntry[] {
  return Object.entries(readAll())
    .map(([name, e]) => ({ name, ...e }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function fileName(name: string): string {
  return `${slug(name)}.yaml`;
}

/**
 * `_file_yaml`: the saved text for this name, normalised through from_yaml/to_yaml so hand
 * formatting doesn't count as a change. Null when there is none or it no longer parses.
 */
export function libraryYaml(name: string): string | null {
  const e = readAll()[slug(name)];
  if (!e) return null;
  try {
    return toYaml(fromYaml(e.yaml)[0]);
  } catch (err) {
    if (err instanceof YamlError) return null;
    throw err;
  }
}

export function readEntry(name: string): LibraryEntry | null {
  const e = readAll()[slug(name)];
  return e ? { name: slug(name), ...e } : null;
}

export function writeEntry(name: string, yaml: string, now = Date.now()): boolean {
  const all = readAll();
  all[slug(name)] = { yaml, savedAt: now };
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function deleteEntry(name: string): void {
  const all = readAll();
  delete all[slug(name)];
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(all));
  } catch {
    /* storage blocked: nothing to delete */
  }
}
