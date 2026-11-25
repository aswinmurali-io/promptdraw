// Shared test fixtures, ported from the Python app's test_workflow.py.
import { Workflow, type Loop } from "../core/workflow";

/** Goal → [Recon ∥ Audit] → note → Implement → loop[Critique → Refine] → Review */
export function sample(): Workflow {
  return new Workflow({
    name: "shop_screen_polish",
    goal: "Match the Shop screen to shop_ref.png",
    blocks: [
      { id: "b1", type: "stage", name: "Recon", prompt: "map it", template: "recon" },
      { id: "b2", type: "stage", name: "Audit", prompt: "audit it" },
      { id: "b3", type: "prompt", text: "Use Unity MCP." },
      { id: "b4", type: "stage", name: "Implement", prompt: "build it" },
      { id: "b5", type: "stage", name: "Critique", prompt: "compare" },
      { id: "b6", type: "stage", name: "Refine", prompt: "fix" },
      { id: "b7", type: "stage", name: "Review", prompt: "review" },
    ],
    parallels: [{ id: "p1", blocks: ["b1", "b2"], join: "all" }],
    loops: [
      { id: "l1", blocks: ["b5", "b6"], agentic: true, mode: "reward", reward: "Pixel diff vs ref.", metric: "pixel_similarity", target: 97, max_passes: 8 },
    ],
  });
}

/** Readable shape: units joined by →, parallel branches by ∥, loops (nested too) in []. */
export function flow(wf: Workflow, within: Loop | null = null): string {
  const out: string[] = [];
  for (const g of wf.chunks(within ? within.blocks : wf.ids(), true, within)) {
    const lp = wf.childLoop(g[0] as string, within);
    out.push(lp ? "[" + flow(wf, lp) + "]" : g.join("∥"));
  }
  return out.join(" → ");
}

/** Critique defined once, used by two parallel stages and a note. */
export function withFunctions(): Workflow {
  return new Workflow({
    name: "fn",
    goal: "g",
    blocks: [
      { id: "b1", type: "function", name: "Critique", params: ["take", "focus"], text: "Critique take {{take}}, focusing on {{focus}}. Keep {{BUDGET}}." },
      { id: "b2", type: "stage", name: "A", prompt: '[[Critique: take = A, focus = "timing, easing"]]' },
      { id: "b3", type: "stage", name: "B", prompt: "Then [[critique: take = B, focus = {{FOCUS_B}}]] now." },
      { id: "b4", type: "prompt", text: "Notes may use [[CRITIQUE: take = C, focus = all]] too." },
    ],
    parallels: [{ id: "p1", blocks: ["b2", "b3"], join: "all" }],
  });
}
