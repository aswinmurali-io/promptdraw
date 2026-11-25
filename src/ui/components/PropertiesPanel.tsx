// Left properties island: The Python app's rail settings. Workspace groups are always shown (on the
// Stages tab they show and edit the workflow's pins); the toggle sub-options are Task-tab only
// and each one is live only when its toggle is on, exactly like the Tk rail.
import { useId, useRef, type ReactNode } from "react";
import { usePanelMotion } from "../lib/motion";
import type { AppConfig } from "../../core";
import { effectiveWorkspace, pinnedKeys, type WorkspaceKey } from "../state/store";
import { Icon } from "./Icon";
import { Check } from "./SettingFields";
import "../styles/properties.css";

export interface PropertiesPanelProps {
  cfg: AppConfig;
  set: (patch: Partial<AppConfig>, coalesce?: string) => void;
  setWorkspace: (key: WorkspaceKey, value: string, coalesce?: string) => void;
  onClose: () => void;
}

export function PropertiesPanel({ cfg, set, setWorkspace, onClose }: PropertiesPanelProps) {
  const ws = effectiveWorkspace(cfg);
  const pins = pinnedKeys(cfg);
  const ref = useRef<HTMLElement>(null);
  usePanelMotion(ref, true, "pop");

  return (
    <aside ref={ref} className="props-panel settings-panel island" aria-labelledby="props-title" data-inset="left">
      <header className="insp-header props-head">
        <h2 id="props-title" className="props-title insp-title">
          Settings
        </h2>
        <button type="button" className="icon-btn icon-btn--sm insp-close" onClick={onClose} aria-label="Hide settings panel" title="Hide settings panel (3)">
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="insp-body settings-body">

        <Group title="Branch approach" pinned={pins.has("branch") || pins.has("base")}>
          <Segmented
            name="branch"
            value={ws.branch}
            options={[
              ["same", "Same branch"],
              ["new", "Create new branch"],
            ]}
            onChange={(v) => setWorkspace("branch", v)}
          />
          <label className="row">
            <span className="row-label">Base branch</span>
            <input
              className="field"
              value={ws.base}
              placeholder="current"
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setWorkspace("base", e.target.value, "base")}
            />
          </label>
        </Group>

        <Group title="Worktree" pinned={pins.has("worktree")}>
          <Segmented
            name="worktree"
            value={ws.worktree}
            options={[
              ["per_task", "Worktree per task"],
              ["none", "No worktree"],
            ]}
            onChange={(v) => setWorkspace("worktree", v)}
          />
          <Check label="Copy .env files" checked={cfg.copy_env} disabled={ws.worktree !== "per_task"} onChange={(copy_env) => set({ copy_env })} />
        </Group>

        <Group title="Commits" pinned={pins.has("commit")}>
          <Segmented
            name="commit"
            value={ws.commit}
            options={[
              ["atomic", "Atomic", "Atomic commits: one focused commit per logical change"],
              ["combined", "Combined", "One combined commit for the whole task"],
              ["none", "None", "Do not commit"],
            ]}
            onChange={(v) => setWorkspace("commit", v)}
          />
        </Group>

        <Group title="Unity instance">
          <Segmented
            name="unity"
            value={cfg.unity === "spawn" ? "spawn" : "existing"}
            options={[
              ["spawn", "Spawn (Android)", "Spawn a Unity editor per task (Android builds)"],
              ["existing", "Use existing", "Use the Unity editor that is already running"],
            ]}
            onChange={(unity) => set({ unity })}
          />
          <Check label="Verify Unity CLI targets this run's editor" checked={cfg.cli_check} onChange={(cli_check) => set({ cli_check })} />
        </Group>

        <p className="props-note muted">
          {cfg.tab === "task"
            ? "Each option's own settings (models, minutes, counts) sit under it in How to work once it is ticked."
            : "On Stages, workflow pins win over these settings. The how-to-work options live in the workflow's Intentions block."}
        </p>
      </div>
    </aside>
  );
}

function Group({ title, pinned, children }: { title: string; pinned?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <section className="group" role="group" aria-labelledby={id}>
      <h3 id={id} className="group-label">
        {title}
        {pinned && (
          <span className="pin-badge" title="Pinned by the workflow: editing changes the pin">
            <Icon name="pin" size={12} /> pinned
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

/** One track of choices, the picked one raised on it (a segmented control); a long pair wraps. */
function Segmented<T extends string>({ name, value, options, onChange }: { name: string; value: T; options: ([T, string] | [T, string, string])[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map(([v, label, title]) => (
        <label key={v} className="seg-option" data-checked={value === v} title={title}>
          <input type="radio" className="visually-hidden" name={`pd-${name}`} value={v} checked={value === v} aria-label={title} onChange={() => onChange(v)} />
          {label}
        </label>
      ))}
    </div>
  );
}

