// Helper for authoring workflow YAML: reads the live core, so nothing here goes stale.
//
//   npx vite-node scripts/workflow-tool.ts constants          allowed values, defaults, toggles, templates
//   npx vite-node scripts/workflow-tool.ts starters           list the built-in example workflows
//   npx vite-node scripts/workflow-tool.ts example <key>      print a starter as YAML (the format to copy)
//   npx vite-node scripts/workflow-tool.ts validate <file>    parse a workflow file: warnings, round-trip diff
//   npx vite-node scripts/workflow-tool.ts prompt <file>      print the `## Workflow` prompt it compiles to
//   npx vite-node scripts/workflow-tool.ts link <file>        print the open and check links (as the skill's link.mjs)
import { readFileSync } from "node:fs";
import {
  JOINS,
  LOOP_DEFAULTS,
  STAGE_MODELS,
  TEMPLATES,
  TOGGLE_ORDER,
  TOGGLE_TEXT,
  WORKSPACE,
  Workflow,
  fromYaml,
  toYaml,
  workflowPrompt,
  YamlError,
} from "../src/core";
import { STARTERS } from "../src/ui/stages/starters";
// @ts-expect-error -- the skill's dependency-free .mjs, outside the TS project
import { makeLinks } from "../plugins/promptdraw/skills/promptdraw/link.mjs";

const [cmd, arg] = process.argv.slice(2);

function load(file?: string): [Workflow, string[], string] {
  if (!file) throw new Error("give a workflow file path");
  const src = readFileSync(file, "utf8");
  const [wf, warnings] = fromYaml(src);
  return [wf, warnings, src];
}

try {
  if (cmd === "constants") {
    console.log(JSON.stringify({ STAGE_MODELS, JOINS, LOOP_DEFAULTS, WORKSPACE }, null, 2));
    console.log("\nTemplates (stage `template:` keys):");
    for (const [k, t] of Object.entries(TEMPLATES)) console.log(`  ${k}: ${t.name} - ${t.hint}`);
    console.log("\nToggles (intentions block `toggles:` keys), in prompt order:");
    for (const k of TOGGLE_ORDER) console.log(`  ${k}: ${TOGGLE_TEXT[k][0]}`);
  } else if (cmd === "starters") {
    for (const s of STARTERS) console.log(`${s.key}\t${s.label} - ${s.hint}`);
  } else if (cmd === "example") {
    const s = STARTERS.find((x) => x.key === arg);
    if (!s) throw new Error(`no starter "${arg}"; keys: ${STARTERS.map((x) => x.key).join(", ")}`);
    process.stdout.write(toYaml(new Workflow(s.workflow)));
  } else if (cmd === "validate") {
    const [wf, warnings, src] = load(arg);
    console.log(warnings.length ? "Warnings:\n" + warnings.map((w) => "  - " + w).join("\n") : "No warnings.");
    console.log(`\nParsed: ${wf.blocks.length} blocks, ${wf.parallels.length} parallel groups, ${wf.loops.length} loops.`);
    const again = toYaml(wf);
    console.log(again === src ? "Round trip: identical." : "Round trip: the app would rewrite this file (run `example` for the canonical shape).");
    process.exitCode = warnings.length ? 1 : 0;
  } else if (cmd === "prompt") {
    console.log(workflowPrompt(load(arg)[0]));
  } else if (cmd === "link") {
    const links = makeLinks(load(arg)[2]);
    console.log(`open: ${links.open}\ncheck: ${links.check}\nlength: ${links.length}`);
  } else {
    console.log("usage: constants | starters | example <key> | validate <file> | prompt <file> | link <file>");
    process.exitCode = 2;
  }
} catch (e) {
  console.error((e instanceof YamlError ? "YAML error: " : "") + (e instanceof Error ? e.message : String(e)));
  process.exitCode = 1;
}
