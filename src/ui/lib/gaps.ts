// Placeholders the compiler writes where an input is empty (the Python app's wording, kept byte for
// byte in the prompt). The UI looks for them in the text about to be copied, so a prompt that
// still says "<describe the task here>" is flagged before it is pasted anywhere. A stage with no
// description compiles (like the Python app) to a line that ends on its dash, "1. **Stage 1** — ", which
// is flagged the same way without changing the prompt itself, and so is an empty prompt block,
// which compiles to a bare "**Note:** " line.
// @lat: [[ui#Islands]]

export interface PromptGap {
  /** What to fill in, and where it lives. */
  key: "task" | "goal" | "stage" | "note";
  /** Short name for the warning chip: "Task is empty". */
  label: string;
  /** The exact placeholder the compiler emits (for a stage, its dangling line). */
  placeholder: string;
  /** A stage gap's number as the prompt prints it: "2", "3b", or "C1" for a cancel stage. */
  stage?: string;
}

// A stage or cancel-stage line whose description is empty: it ends right after the dash.
// Nothing but the read-only mark or a model hint (neither has a dash) sits between the bold
// name and the separator, so a description that itself ends on a dash is not flagged.
const EMPTY_STAGE = /^(C?)(\d+[a-z]?)\. \*\*[^\n]*?\*\*[^—\n]* — ?$/gm;
// A prompt block with no text: the label and nothing after it.
const EMPTY_NOTE = /^\*\*Note:\*\* ?$/gm;

export const GAPS: readonly PromptGap[] = [
  { key: "task", label: "Task", placeholder: "<describe the task here>" },
  { key: "goal", label: "Goal", placeholder: "<describe the goal here>" },
];

/** The placeholders still present in `prompt`, in the order above. */
export function promptGaps(prompt: string): PromptGap[] {
  const out = GAPS.filter((g) => prompt.includes(g.placeholder));
  for (const m of prompt.matchAll(EMPTY_STAGE)) {
    const [line, cancel, n] = m as unknown as [string, string, string];
    out.push({ key: "stage", label: cancel ? `Cancel stage ${n}` : `Stage ${n}`, placeholder: line.trimEnd(), stage: cancel + n });
  }
  for (const m of prompt.matchAll(EMPTY_NOTE)) out.push({ key: "note", label: "Prompt block", placeholder: m[0].trimEnd() });
  return out;
}

/** "Task is empty", "Task and Goal are empty", "Stage 2 has no description",
 *  "Goal and 2 stage descriptions are empty", "A prompt block is empty". */
export function gapsLabel(gaps: readonly PromptGap[]): string {
  if (!gaps.length) return "";
  const names = gaps.filter((g) => g.key === "task" || g.key === "goal").map((g) => g.label);
  const stages = gaps.filter((g) => g.key === "stage");
  const notes = gaps.filter((g) => g.key === "note").length;
  const noteName = notes === 1 ? "a prompt block" : `${notes} prompt blocks`;
  if (!names.length && !notes) return stages.length === 1 ? `${stages[0]!.label} has no description` : `${stages.length} stages have no description`;
  if (stages.length) names.push(stages.length === 1 ? `${stages[0]!.label}'s description` : `${stages.length} stage descriptions`);
  if (notes) names.push(noteName);
  const first = names[0]!.charAt(0).toUpperCase() + names[0]!.slice(1);
  if (names.length === 1) return `${first} ${notes > 1 && !stages.length ? "are" : "is"} empty`;
  return `${[first, ...names.slice(1, -1)].join(", ")} and ${names.at(-1)} are empty`;
}
