// The Task fields (the Python app's TASK and EXTRA NOTES Text widgets) at the top of How to work, drawn
// as the Stages Goal card: where the run starts. The board shows the task as its Goal card, and
// TaskCanvas holds the board itself.
import type { ReactNode, Ref } from "react";
import { CardFrame } from "../stages/SceneView";

/** Task-prompt mode content on the canvas: the board of the task and its ticked options. */
export function TaskCanvas({ children }: { children?: ReactNode }) {
  return <div className="task-canvas">{children}</div>;
}

export interface TaskFieldsProps {
  task: string;
  extra: string;
  onTask: (v: string) => void;
  onExtra: (v: string) => void;
  taskRef?: Ref<HTMLTextAreaElement>;
}

export function TaskFields({
  task,
  extra,
  onTask,
  onExtra,
  taskRef,
}: TaskFieldsProps) {
  return (
    <section className="goal-node work-task">
      <CardFrame kind="goal" seed={11} />
      <div className="sketch-card sketch-card--task">
        <div className="sketch-title-row">
          <span className="goal-eyebrow goal-kind" aria-hidden="true">
            Goal ·
          </span>
          <label className="goal-eyebrow" htmlFor="pd-task">
            Task
          </label>
          {/* Emphasis without a frame that reads as "selected": a small tag while it is empty. */}
          {!task.trim() && (
            <span className="start-tag" aria-hidden="true">
              Start here
            </span>
          )}
        </div>
        <textarea
          id="pd-task"
          ref={taskRef}
          className="sketch-input hand"
          rows={4}
          value={task}
          placeholder="Describe the task here…"
          onChange={(e) => onTask(e.target.value)}
          spellCheck
        />
      </div>
      <div className="sketch-card sketch-card--notes">
        <label className="goal-eyebrow" htmlFor="pd-extra">
          Extra notes
        </label>
        <textarea
          id="pd-extra"
          className="sketch-input hand"
          rows={2}
          value={extra}
          placeholder="Anything else the agent should know (optional)"
          onChange={(e) => onExtra(e.target.value)}
          spellCheck
        />
      </div>
    </section>
  );
}
