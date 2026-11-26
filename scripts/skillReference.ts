// The promptdraw skill's generated files, rendered from the live core: `reference.md` (allowed
// values, defaults, templates, toggles) and `example.yaml` (a starter in canonical shape).
// `npm run skill:ref` writes them; skillReference.test.ts fails when they drift.
// @lat: [[testing#Workflow authoring tool]]
import { JOINS, LOOP_DEFAULTS, STAGE_MODELS, TEMPLATES, TOGGLE_ORDER, TOGGLE_TEXT, WORKSPACE, Workflow, toYaml } from "../src/core";
import { STARTERS } from "../src/ui/stages/starters";

export const EXAMPLE_STARTER = "sprint-chaser";

const code = (v: unknown) => "`" + (typeof v === "string" && v !== "" ? v : JSON.stringify(v)) + "`";

export function renderReference(): string {
  const out: string[] = [
    "# promptdraw reference",
    "",
    "Generated from promptdraw's source by `npm run skill:ref`; do not edit by hand. Values not",
    "listed here are dropped with a load warning.",
    "",
    "## Stage and function models (`model:`)",
    "",
    STAGE_MODELS.map(code).join(", "),
    "",
    "## Parallel joins (`join:`)",
    "",
    "- `all`: wait for every branch.",
    "- `first`: stop the other branches once one finishes.",
    "",
    `Allowed: ${JOINS.map(code).join(", ")}`,
    "",
    "## Loop defaults",
    "",
    "| Key | Default |",
    "|---|---|",
    ...Object.entries(LOOP_DEFAULTS).map(([k, v]) => `| ${code(k)} | ${code(v)} |`),
    "",
    "`mode` is `count` or `reward`.",
    "",
    "## Workspace keys (top level)",
    "",
    "| Key | Allowed values |",
    "|---|---|",
    ...Object.entries(WORKSPACE).map(([k, v]) => `| ${code(k)} | ${v ? v.map(code).join(", ") : "free text"} |`),
    "",
    "## Stage templates (`template:`)",
    "",
    "| Key | Name | What it does |",
    "|---|---|---|",
    ...Object.entries(TEMPLATES).map(([k, t]) => `| ${code(k)} | ${t.name} | ${t.hint} |`),
    "",
    "## Intentions toggles (`toggles:`), in prompt order",
    "",
    "| Key | Option |",
    "|---|---|",
    ...TOGGLE_ORDER.map((k) => `| ${code(k)} | ${TOGGLE_TEXT[k][0]} |`),
    "",
    "## Starter workflows",
    "",
    "The app's Demo workflows. `example.yaml` is the first, in canonical shape.",
    "",
    ...STARTERS.map((s) => `- ${code(s.key)}: ${s.label}, ${s.hint}`),
    "",
  ];
  return out.join("\n");
}

export function renderExample(): string {
  const s = STARTERS.find((x) => x.key === EXAMPLE_STARTER);
  if (!s) throw new Error(`no starter ${EXAMPLE_STARTER}`);
  return toYaml(new Workflow(s.workflow));
}
