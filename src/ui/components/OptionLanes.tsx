// The Simple task board, drawn by the Stages renderer: the board is a Workflow scene
// (lib/taskScene) and SceneView paints it, so the Goal card, a parallel frame, a read-only stage,
// a model tag and an agentic loop look exactly as they do on Stages. The flow runs from the Goal
// card (the task; it opens the Task field in How to work) into a parallel group (one row per
// option; an option that builds on another follows it) and on to the Prompt card, left to right
// as the Stages flow runs (the board pans). Display only. Changes animate (lib/boardMotion); a reload draws it in place.
// @lat: [[ui#Canvas#Parallel option lanes]]
import { useRef, type MouseEvent } from "react";
import { TOGGLE_TEXT, type ToggleKey } from "../../core";
import { GOAL_KEY, PROMPT_KEY, taskScene, toggleOfCard, type TaskSceneInput } from "../lib/taskScene";
import { NO_SELECTION } from "../stages/edits";
import { hitOf } from "../stages/scene";
import { SceneView } from "../stages/SceneView";
import { Icon } from "./Icon";
import { useBoardMotion } from "../lib/boardMotion";
import "../styles/stages.css";

export interface OptionLanesProps {
  input: TaskSceneInput;
  onToggle: (key: ToggleKey, on: boolean) => void;
  onPrompt: () => void;
  /** The Goal card: open the Task field in How to work. */
  onGoal: () => void;
}

export function OptionLanes({ input, onToggle, onPrompt, onGoal }: OptionLanesProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const ts = taskScene(input);

  useBoardMotion(svgRef, ts.scene);

  const onClick = (e: MouseEvent) => {
    const hit = hitOf(e.target);
    if (!hit) return;
    const key = toggleOfCard(hit.key);
    if (hit.role === "del" && key) onToggle(key, false);
    else if (hit.role === "node" && hit.key === PROMPT_KEY) onPrompt();
    else if (hit.role === "node" && hit.key === GOAL_KEY) onGoal();
  };

  const board = ts.scene.board;
  const options = [...new Set([...(board?.removable ?? [])].map(toggleOfCard).filter((k): k is ToggleKey => !!k))];
  const empty = !options.length;
  return (
    <section className="lanes" data-empty={empty || undefined} aria-label="How the task runs">
      <svg
        ref={svgRef}
        className="stage-svg lanes-svg"
        viewBox={`0 0 ${ts.width} ${ts.height}`}
        width={ts.width}
        height={ts.height}
        aria-hidden="true"
        focusable="false"
        onClick={onClick}
      >
        <SceneView scene={ts.scene} selection={NO_SELECTION} />
      </svg>
      {empty && (
        <p className="lanes-hint hand">
          Tick an option under How to work
          <small>each one runs alongside the task</small>
        </p>
      )}
      {/* The drawing is a picture; these are its controls for keyboards and screen readers. */}
      <ul className="visually-hidden" aria-label="Options on the board">
        {options.map((k) => (
          <li key={k}>
            <button type="button" onClick={() => onToggle(k, false)}>{`Remove ${TOGGLE_TEXT[k][0]}`}</button>
            {board?.locked.has(k) && <span>{" (locked)"}</span>}
          </li>
        ))}
      </ul>
      <button type="button" className="visually-hidden" onClick={onGoal}>
        Edit the task
      </button>
      <button type="button" className="visually-hidden" onClick={onPrompt}>
        <Icon name="promptPanel" size={16} />
        Show the prompt
      </button>
    </section>
  );
}
