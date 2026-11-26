// The Workflow check that check mode prints: does the app load this YAML without warnings, and
// would it write the same file back? The round trip catches what the faithful parser ignores
// silently, such as a misspelled key.
// @lat: [[ui#Workflow links#Check mode]]
import { fromYaml, toYaml, YamlError } from "../../core";

export type CheckResult =
  | { ok: false; error: string }
  | {
      ok: true;
      name: string;
      blocks: number;
      parallels: number;
      loops: number;
      warnings: string[];
      identical: boolean;
      /** The first five differing lines, 1-based, between the file and what the app writes. */
      diff: { line: number; yours: string; app: string }[];
      pass: boolean;
    };

/** Lines compared in the round trip: comments and line endings are not the file's content. */
function lines(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\n+$/, "")
    .split("\n")
    .filter((l) => !/^\s*#/.test(l));
}

export function checkWorkflow(text: string): CheckResult {
  let parsed: ReturnType<typeof fromYaml>;
  try {
    parsed = fromYaml(text);
  } catch (e) {
    return { ok: false, error: e instanceof YamlError ? e.message : String((e as Error)?.message ?? e) };
  }
  const [wf, warnings] = parsed;
  const yours = lines(text);
  const app = lines(toYaml(wf));
  const diff: { line: number; yours: string; app: string }[] = [];
  for (let i = 0; i < Math.max(yours.length, app.length) && diff.length < 5; i++) {
    if (yours[i] !== app[i]) diff.push({ line: i + 1, yours: yours[i] ?? "", app: app[i] ?? "" });
  }
  const identical = diff.length === 0;
  return {
    ok: true,
    name: wf.name,
    blocks: wf.blocks.length,
    parallels: wf.parallels.length,
    loops: wf.loops.length,
    warnings,
    identical,
    diff,
    pass: identical && warnings.length === 0,
  };
}

/** The report as plain text, one fact per line, so an agent reading the page can act on it. */
export function reportText(r: CheckResult): string {
  if (!r.ok) return `Workflow check: FAIL\nCouldn't load workflow: ${r.error}`;
  const out = [
    `Workflow check: ${r.pass ? "PASS" : "FAIL"}`,
    `Workflow: ${r.name} (${r.blocks} blocks, ${r.parallels} parallel groups, ${r.loops} loops)`,
    r.warnings.length ? ["Warnings:", ...r.warnings.map((w) => `- ${w}`)].join("\n") : "Warnings: none",
  ];
  if (r.identical) out.push("Round trip: identical");
  else {
    out.push("Round trip: the app would rewrite this file");
    for (const d of r.diff) out.push(`  line ${d.line}\n    yours: ${d.yours}\n    app:   ${d.app}`);
  }
  return out.join("\n");
}
