// Left properties island: The Python app's rail settings (see WorkspaceSettings). On the Stages
// tab it stands in only while the workflow has no Intentions block; with one, the same settings
// live in that block's inspector.
import { useRef } from "react";
import { usePanelMotion } from "../lib/motion";
import type { AppConfig } from "../../core";
import type { WorkspaceKey } from "../state/store";
import { Icon } from "./Icon";
import { WorkspaceSettings } from "./WorkspaceSettings";
import "../styles/properties.css";

export interface PropertiesPanelProps {
  cfg: AppConfig;
  set: (patch: Partial<AppConfig>, coalesce?: string) => void;
  setWorkspace: (key: WorkspaceKey, value: string, coalesce?: string) => void;
  onClose: () => void;
}

export function PropertiesPanel({ cfg, set, setWorkspace, onClose }: PropertiesPanelProps) {
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

        <WorkspaceSettings cfg={cfg} set={set} setWorkspace={setWorkspace} />

        <p className="props-note muted">
          {cfg.tab === "task"
            ? "Each option's own settings (models, minutes, counts) sit under it in How to work once it is ticked."
            : "On Stages, workflow pins win over these settings. Add an Intentions block to keep them, with the how-to-work options, in its inspector."}
        </p>
      </div>
    </aside>
  );
}
