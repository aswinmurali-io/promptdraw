// The git, worktree, commit and Unity settings: shown in the Settings panel and, on the Stages
// tab, inside the Intentions block's inspector. On Stages the workspace groups show and edit the
// workflow's pins (see effectiveWorkspace); Unity is always the app-wide setting.
import { useId, type ReactNode } from "react";
import type { AppConfig } from "../../core";
import { effectiveWorkspace, pinnedKeys, type WorkspaceKey } from "../state/store";
import { Icon } from "./Icon";
import { Check } from "./SettingFields";
import "../styles/properties.css";

export interface WorkspaceSettingsProps {
  cfg: AppConfig;
  set: (patch: Partial<AppConfig>, coalesce?: string) => void;
  setWorkspace: (key: WorkspaceKey, value: string, coalesce?: string) => void;
}

export function WorkspaceSettings({ cfg, set, setWorkspace }: WorkspaceSettingsProps) {
  const ws = effectiveWorkspace(cfg);
  const pins = pinnedKeys(cfg);
  return (
    <>
      <Group title="Branch approach" pinned={pins.has("branch") || pins.has("base")}>
        <Segmented
          name="branch"
          value={ws.branch}
          options={[
            ["off", "Off", "Say nothing about branches"],
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
            disabled={ws.branch === "off"}
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
            ["off", "Off", "Say nothing about worktrees"],
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
          value={cfg.unity === "off" ? "off" : cfg.unity === "spawn" ? "spawn" : "existing"}
          options={[
            ["off", "Off", "Leave the Unity section out of the prompt"],
            ["spawn", "Spawn (Android)", "Spawn a Unity editor per task (Android builds)"],
            ["existing", "Use existing", "Use the Unity editor that is already running"],
          ]}
          onChange={(unity) => set({ unity })}
        />
        <Check label="Verify Unity CLI targets this run's editor" checked={cfg.cli_check} disabled={cfg.unity === "off"} onChange={(cli_check) => set({ cli_check })} />
      </Group>
    </>
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
  // Unique per instance, so the Settings panel and the Intentions inspector never share a group.
  const uid = useId();
  return (
    <div className="segmented" role="radiogroup">
      {options.map(([v, label, title]) => (
        <label key={v} className="seg-option" data-checked={value === v} title={title}>
          <input type="radio" className="visually-hidden" name={`pd-${name}${uid}`} value={v} checked={value === v} aria-label={title} onChange={() => onChange(v)} />
          {label}
        </label>
      ))}
    </div>
  );
}

