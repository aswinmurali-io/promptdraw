// ============================================================================================
//  STAGES CANVAS MOUNT POINT
//  The workflow / stage editor (the Python app's stage_builder.py rebuilt as a hand-drawn infinite
//  canvas). The app owns the controller (`useStages`) so the inspector island, the action
//  registry and the zoom island can drive the same editor; this component renders the
//  canvas layer and its floating helpers.
// ============================================================================================
import type { ReactNode } from "react";
import { IDLE_HINT } from "../stages/edits";
import { CardNotes, EmptyHint } from "../stages/EmptyHint";
import { StageCanvas, type StageCanvasProps } from "../stages/StageCanvas";
import type { StagesController } from "../stages/useStages";
import "../styles/stages.css";

export interface StagesMountProps {
  ctl: StagesController;
  onAdd?: StageCanvasProps["onAdd"];
  onContextMenu?: StageCanvasProps["onContextMenu"];
  /** Floating islands that belong to the editor (stage bar, menus). */
  children?: ReactNode;
}

/** From this many blocks on, the idle how-to line steps aside: by then the canvas has been
 *  used, and a hint left under a full board is noise (the gestures stay listed under Help). */
export const HINT_BLOCKS_MAX = 1;

export function StagesMount({ ctl, onAdd, onContextMenu, children }: StagesMountProps) {
  const n = ctl.workflow.blocks.length;
  const empty = !n && !ctl.selection.focus;
  // The empty workflow's own hint takes this spot; past the first block the idle line fades.
  // A status that says something (what is ticked, what L or G would do) always shows.
  const quiet = empty || (ctl.hint === IDLE_HINT && n > HINT_BLOCKS_MAX);
  return (
    <div id="stages-canvas-mount" className="stages-mount" data-mount="stages-canvas">
      <StageCanvas ctl={ctl} onAdd={onAdd ?? (() => {})} onContextMenu={onContextMenu ?? (() => {})} />
      {empty && <CardNotes view={ctl.view} cards={ctl.scene.L.cards} />}
      {empty && <EmptyHint />}
      {/* Quiet only fades it: the status line is still read out. */}
      <p className="stage-hint" aria-live="polite" data-quiet={quiet || undefined}>
        {ctl.hint}
      </p>
      {children}
    </div>
  );
}
