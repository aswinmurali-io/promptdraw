// Menu contents for the stage editor: The Python app's add menu (StageBuilder.add_menu) and a
// context menu per thing under the pointer. Pure item builders over the controller.
import { TEMPLATES, type BlockKind, type TemplateKey } from "../../core";
import type { PopItem } from "../components/PopMenu";
import * as E from "./edits";
import type { InsertSpot } from "./edits";
import type { Hit } from "./scene";
import type { StagesController } from "./useStages";

/**
 * Blank stage, Prompt block, Function block, Intentions (disabled once present), then the
 * stage templates. A "+ branch" tile offers stages only (`allowAll` false).
 */
export function addMenuItems(ctl: StagesController, spot: InsertSpot, allowAll: boolean): PopItem[] {
  const pick = (kind: BlockKind, tpl: string | null = null) => () => ctl.insert(spot, kind, tpl);
  const has = ctl.scene.wf.intentions() !== null;
  const items: PopItem[] = [{ label: "Blank stage", onSelect: pick("stage") }];
  if (allowAll)
    items.push(
      { label: "Prompt block", onSelect: pick("prompt") },
      { label: "Function block", onSelect: pick("function") },
      { label: "Intentions", hint: has ? "already in this workflow" : undefined, disabled: has, onSelect: pick("intentions") },
    );
  items.push({ separator: true }, { header: "Templates" });
  for (const key of Object.keys(TEMPLATES) as TemplateKey[]) {
    const t = TEMPLATES[key];
    items.push({ label: t.name, hint: t.hint, onSelect: pick("stage", key) });
  }
  return items;
}

/** Right-click menu: what it offers depends on what was clicked. */
export function contextMenuItems(ctl: StagesController, hit: Hit | null, at: { x: number; y: number }): PopItem[] {
  const { wf } = ctl.scene;
  const add = (spot: InsertSpot, allowAll = true): PopItem => ({
    label: "Add…",
    onSelect: () => ctl.openMenu({ x: at.x, y: at.y, label: "Add block", items: addMenuItems(ctl, spot, allowAll) }),
  });
  const group: PopItem[] = [
    { label: "Loop selected blocks", shortcut: "L", disabled: !ctl.canLoop, onSelect: ctl.makeLoop },
    { label: "Run selected in parallel", shortcut: "G", disabled: !ctl.canPar, onSelect: ctl.makePar },
  ];
  const view: PopItem[] = [
    { label: "Zoom to fit", shortcut: "Shift+1", onSelect: ctl.fit },
    { label: "Reset zoom", onSelect: ctl.zoomReset },
  ];

  if (!hit || hit.role === "plus") {
    return [
      { label: "Add stage", shortcut: "S", onSelect: () => ctl.insert({ after: null }, "stage", null) },
      { label: "Add prompt block", shortcut: "P", onSelect: () => ctl.insert({ after: null }, "prompt", null) },
      { label: "Add function block", shortcut: "F", onSelect: () => ctl.insert({ after: null }, "function", null) },
      { label: "Add intentions", shortcut: "I", disabled: wf.intentions() !== null, onSelect: () => ctl.insert({ after: null }, "intentions", null) },
      { separator: true },
      { label: "Select all blocks", onSelect: ctl.selectAll },
      { label: "Clear selection", disabled: !ctl.selection.sel.length, onSelect: ctl.clearSelection },
      ...group,
      { separator: true },
      ...view,
    ];
  }
  if (hit.role === "loop") {
    const l = wf.loop(hit.key);
    const parent = l ? wf.parentLoop(l) : null;
    return [
      { label: "Edit loop", onSelect: () => ctl.setFocus({ kind: "loop", id: hit.key }) },
      add({ after: { kind: "loop", id: hit.key } }),
      ...(parent ? [{ label: "Edit outer loop", onSelect: () => ctl.setFocus({ kind: "loop", id: parent.id }) }] : []),
      { separator: true },
      { label: "Remove loop", danger: true, onSelect: () => ctl.removeLoop(hit.key) },
    ];
  }
  if (hit.role === "par" || hit.role === "branch") {
    return [
      { label: "Edit group", onSelect: () => ctl.setFocus({ kind: "par", id: hit.key }) },
      { label: "Add branch…", onSelect: () => ctl.openMenu({ x: at.x, y: at.y, label: "Add branch", items: addMenuItems(ctl, { par: hit.key }, false) }) },
      add({ after: { kind: "par", id: hit.key } }),
      { separator: true },
      { label: "Ungroup", danger: true, onSelect: () => ctl.ungroup(hit.key) },
    ];
  }
  const key = hit.key;
  if (key === "goal") return [{ label: "Edit goal", onSelect: () => ctl.setFocus({ kind: "goal" }, []) }, add({ at: 0, loop: null }), { separator: true }, ...view];
  if (key === "on_cancel")
    return [
      { label: "Edit on-cancel settings", onSelect: () => ctl.setFocus({ kind: "oncancel" }, []) },
      { label: "Add cancel stage", onSelect: ctl.addCancelStage },
    ];
  if (key.startsWith("cancel:")) {
    const i = Number(key.slice(7));
    const n = wf.on_cancel.stages.length;
    return [
      { label: "Edit cancel stage", onSelect: () => ctl.setFocus({ kind: "cancel", i }, []) },
      { label: "Run earlier", shortcut: "Alt+←", disabled: i <= 0, onSelect: () => ctl.moveCancel(i, -1) },
      { label: "Run later", shortcut: "Alt+→", disabled: i >= n - 1, onSelect: () => ctl.moveCancel(i, 1) },
      { separator: true },
      { label: "Remove", danger: true, onSelect: () => ctl.remove(key) },
    ];
  }
  const b = wf.block(key);
  if (!b) return [];
  const p = wf.parOf(key);
  const lp = wf.loopOf(key);
  const selected = ctl.selection.sel.includes(key);
  // A ticked card groups the ticked blocks; an unticked one offers to loop just itself.
  const own = selected ? group : [{ label: "Loop this block", disabled: !E.groupChecks(wf.toDict(), [key]).loop[0], onSelect: () => ctl.makeLoop([key]) }];
  return [
    { label: "Edit", onSelect: () => ctl.setFocus({ kind: "block", id: key }) },
    add({ after: { kind: "block", id: key } }),
    { label: selected ? "Untick" : "Tick for loop / parallel", onSelect: () => ctl.toggleSel(key) },
    { separator: true },
    { label: p ? "Move left" : "Move up", shortcut: p ? "Alt+←" : "Alt+↑", disabled: !wf.canMove(key, -1), onSelect: () => ctl.move(key, -1) },
    { label: p ? "Move right" : "Move down", shortcut: p ? "Alt+→" : "Alt+↓", disabled: !wf.canMove(key, 1), onSelect: () => ctl.move(key, 1) },
    ...own,
    ...(p ? [{ label: "Edit group", onSelect: () => ctl.setFocus({ kind: "par", id: p.id }) }] : []),
    ...(lp ? [{ label: "Edit loop", onSelect: () => ctl.setFocus({ kind: "loop", id: lp.id }) }] : []),
    { separator: true },
    { label: "Delete", shortcut: "Del", danger: true, onSelect: () => ctl.remove(key) },
  ];
}
