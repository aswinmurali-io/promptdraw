// Import / export: The Python app's .prompt_builder.json (both directions, same format) and workflow
// YAML (the Python app's own reader/writer), plus the compiled prompt as Markdown.
import { fromYaml, isPlainObject, loadAppConfig, serializeAppConfig, toYaml, Workflow, YamlError, type AppConfig } from "../../core";

export const CONFIG_FILE = "prompt_builder.json";
export const OPEN_ACCEPT = ".json,.yaml,.yml,application/json,text/yaml,application/x-yaml";

export type ImportResult =
  /** `replacesWorkflow`: applying it changes the workflow, so unsaved stage edits would be lost. */
  | { ok: true; kind: "config" | "workflow"; cfg: AppConfig; replacesWorkflow: boolean; warnings: string[]; message: string }
  | { ok: false; message: string };

export async function readFileText(file: Blob): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

/**
 * Turn an opened file into the next config. A JSON file is a Python app config: it replaces
 * every saved setting (validated and migrated like App.load_config) but keeps the typed task,
 * which the Python app never saves. A YAML file is a workflow: it replaces the workflow and switches
 * to the Stages tab, reporting the Python app's load warnings.
 */
export function importText(name: string, text: string, current: AppConfig): ImportResult {
  const yaml = /\.ya?ml$/i.test(name);
  if (!yaml) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, message: `Couldn't load ${name}: it is not valid JSON.` };
    }
    if (!isPlainObject(data)) return { ok: false, message: `Couldn't load ${name}: expected a JSON object.` };
    const cfg = { ...loadAppConfig(text), task: current.task };
    const replacesWorkflow = toYaml(new Workflow(cfg.workflow)) !== toYaml(new Workflow(current.workflow));
    return { ok: true, kind: "config", cfg, replacesWorkflow, warnings: [], message: `Loaded ${name}` };
  }
  try {
    const [wf, warnings] = fromYaml(text);
    const cfg: AppConfig = { ...current, workflow: wf.toDict(), tab: "stages" };
    return { ok: true, kind: "workflow", cfg, replacesWorkflow: true, warnings, message: `Loaded ${name}` };
  } catch (e) {
    const why = e instanceof YamlError ? e.message : String((e as Error).message ?? e);
    return { ok: false, message: `Couldn't load workflow ${name}: ${why}` };
  }
}

export async function importFile(file: File, current: AppConfig): Promise<ImportResult> {
  try {
    return importText(file.name, await readFileText(file), current);
  } catch {
    return { ok: false, message: `Couldn't read ${file.name}.` };
  }
}

export function configJson(cfg: AppConfig): string {
  return serializeAppConfig(cfg);
}

export function workflowYaml(cfg: AppConfig): { name: string; text: string } {
  const wf = new Workflow(cfg.workflow);
  return { name: `${wf.name}.yaml`, text: toYaml(wf) };
}

export function downloadText(name: string, text: string, type = "text/plain"): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
