// The Stages tab's islands: The Python app's stage toolbar (WORKFLOW name, Load ▾, New, Save, + Add ▾,
// ↻ Loop, ⇉ Parallel, status and path) split in two, drawn as labelled tools from the action
// registry. The workflow island (top left) holds the name, its File ▾ menu (Save, New and the
// saved workflows) and the status; the stage bar under the main toolbar holds only the tools:
// the three direct add tools, More ▾ (intentions and templates), Loop and Parallel. Fit lives
// in the zoom island. Phones swap the direct tools and More for one Add ▾ menu so the bar fits,
// and carry Fit here instead of a zoom island.
import { slug } from "../../core";
import { shortcutLabel, type AppAction } from "../actions";
import { Icon } from "../components/Icon";
import type { PopItem } from "../components/PopMenu";
import { ToolButton } from "../components/ToolButton";
import { addMenuItems } from "./menus";
import { setName } from "./edits";
import { DraftInput } from "./fields";
import { FlagsPopover } from "./FlagsPopover";
import { fileName } from "./library";
import { STARTERS } from "./starters";
import type { StagesController } from "./useStages";

const NEEDS: Record<string, string> = {
  "stages.loop": "Tick one or more blocks in a row to loop them",
  "stages.parallel": "Tick two or more stages next to each other to run them in parallel",
};

const ADD = ["stages.addStage", "stages.addPrompt", "stages.addFunction"];
const GROUP = ["stages.loop", "stages.parallel"];

/** Bar-only buttons (menus), which aren't registry actions of their own. */
function barTool(label: string, short: string, hint: string, icon: AppAction["icon"]): AppAction {
  return { id: `stagebar.${short}`, label, short, hint, icon, category: "Stages", perform: () => {} };
}

/** Where a tool's menu opens: under it, or above it when the tool sits low on the screen. */
function below(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return r.top > window.innerHeight / 2 ? { x: r.left, y: r.top - 6, above: true } : { x: r.left, y: r.bottom + 6 };
}

const caret = <Icon name="chevronDown" size={12} className="stage-caret" />;

/**
 * The workflow's identity, at the top left: joined to the Menu island where the row fits
 * (wide screens, phones), its own island under the menu at mid widths. Its name, the File ▾
 * menu (Save, New workflow, the saved workflows, Open file…, the starter templates) and a status that only speaks
 * up when there is something to say (unsaved changes, a flash).
 */
export function WorkflowIsland({ ctl, actions, openFile }: { ctl: StagesController; actions: AppAction[]; openFile: () => void }) {
  const byId = new Map(actions.map((a) => [a.id, a]));
  const openFileMenu = (el: HTMLElement) => {
    const lib = ctl.library();
    ctl.openMenu({
      ...below(el),
      label: "Workflow file",
      items: [
        { label: "Save", hint: `workflows/${slug(ctl.workflow.name)}.yaml`, shortcut: shortcutLabel(byId.get("stages.save")), onSelect: ctl.save },
        { label: "New workflow", onSelect: ctl.newWorkflow },
        { separator: true },
        { header: "Open" },
        ...(lib.length
          ? lib.map((e) => ({ label: fileName(e.name), hint: ago(e.savedAt), onSelect: () => ctl.loadEntry(e.name) }))
          : [{ label: "No saved workflows yet", disabled: true, onSelect: () => {} }]),
        { label: "Open file…", shortcut: shortcutLabel(byId.get("file.open")), onSelect: openFile },
        { separator: true },
        { header: "Templates" },
        ...STARTERS.map((s) => ({ label: s.label, hint: s.hint, onSelect: () => ctl.loadStarter(s.key) })),
      ],
    });
  };
  return (
    <div className="workflow-island island" role="group" aria-label="Workflow name and file">
      <label className="stage-name">
        <span className="visually-hidden">Workflow name</span>
        <DraftInput className="field--mono" label="Workflow name" value={ctl.workflow.name} accept={(v) => v.length <= 60} onChange={(v) => ctl.change(setName(ctl.workflow, v), "name")} />
      </label>
      <ToolButton className="stage-file" action={barTool("Workflow file", "File", "Save, start a new workflow, or open a saved one", "library")} after={caret} onClickEl={openFileMenu} haspopup />
      <span className="stage-status" role="status" data-dirty={ctl.dirty || undefined} data-empty={ctl.status ? undefined : true} title={`workflows/${fileName(ctl.workflow.name)}`}>
        <span className="stage-status-text">{ctl.status}</span>
      </span>
    </div>
  );
}

/** The stage tools under the main toolbar: add a block, then group the ticked ones. */
export function StageBar({ ctl, actions }: { ctl: StagesController; actions: AppAction[] }) {
  const byId = new Map(actions.map((a) => [a.id, a]));

  /** The add menu without the three blocks the bar has direct tools for. */
  const moreItems = (): PopItem[] => {
    const all = addMenuItems(ctl, { after: ctl.selection.focus }, true);
    const i = all.findIndex((it) => "label" in it && it.label === "Intentions");
    return i < 0 ? all : all.slice(i);
  };

  const tool = (id: string, className?: string) => {
    const a = byId.get(id);
    if (!a?.icon) return null;
    // A greyed-out group tool says what it needs instead of what it does.
    const need = a.enabled === false ? NEEDS[id] : undefined;
    return <ToolButton key={id} className={className} action={need ? { ...a, hint: need } : a} />;
  };

  // The Flags tool shows once the workflow declares a flag; a workflow without one looks as it always did.
  const hasFlags = (ctl.workflow.flags ?? []).length > 0;
  return (
    <>
    <div className="toolbar stage-bar island" role="toolbar" aria-label="Workflow">
      {ADD.map((id) => tool(id, "stage-direct"))}
      <ToolButton
        className="stage-direct stage-more"
        action={barTool("More blocks", "More", "Add the intentions block or a stage from a template", "addBlock")}
        after={caret}
        onClickEl={(el) => ctl.openMenu({ ...below(el), label: "More blocks", items: moreItems() })}
        haspopup
      />
      <ToolButton
        className="stage-add"
        action={barTool("Add block", "Add", "Add a stage, prompt, function or intentions block", "addBlock")}
        after={caret}
        onClickEl={(el) => ctl.openMenu({ ...below(el), label: "Add block", items: addMenuItems(ctl, { after: ctl.selection.focus }, true) })}
        haspopup
      />
      <span className="toolbar-divider" aria-hidden="true" />
      {GROUP.map((id) => tool(id))}
      {/* Phones only: the zoom island is gone there (pinch zooms), so Fit joins the tools. */}
      <span className="toolbar-divider stage-fit" aria-hidden="true" />
      {tool("stages.fit", "stage-fit")}
      {hasFlags && (
        <>
          <span className="toolbar-divider" aria-hidden="true" />
          <ToolButton
            className="stage-flags"
            action={{ ...(byId.get("stages.flags") ?? barTool("Prompt flags", "Flags", "Choose which A/B variant the prompt follows", "flag")), checked: ctl.flagsOpen }}
            pressable
            onClickEl={() => ctl.setFlagsOpen(!ctl.flagsOpen)}
          />
        </>
      )}
    </div>
    {hasFlags && ctl.flagsOpen && <FlagsPopover ctl={ctl} />}
    </>
  );
}

function ago(t: number): string {
  if (!t) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}
