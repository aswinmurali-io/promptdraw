// A/B forks: where blocks that carry a `when` on the same flag sit next to each other, the
// stage canvas draws them as one fork (lanes labelled Variant A, B …) instead of a straight
// line of stages. Pure and read-only: a fork changes only how the flow is drawn, never how it
// compiles. See flags.ts for what `when` means.
// @lat: [[core#Prompt flags]]
import { FlagError, cleanFlags, evalCond, flagValues, inlineChains, parseCond, whenVariants, type BranchRow, type FlagValue } from "./flags";
import { pyStrip } from "./py";
import type { Workflow } from "./workflow";

export interface Fork {
  /** `fork:` + its first block's id. */
  id: string;
  flag: string;
  /** The blocks, in flow order, one lane each. */
  blocks: string[];
}

export interface VariantInfo {
  flag: string;
  /** The block's `when`, as written. */
  cond: string;
  /** A, B … per flag, in document order ([[src/core/flags.ts#whenVariants]]). */
  letter: string;
  /** Whether the flag values choose this block (always true when a condition cannot be read). */
  selected: boolean;
}

function whenOf(b: Record<string, unknown>): string {
  return b.type !== "intentions" && typeof b.when === "string" ? pyStrip(b.when) : "";
}

/**
 * The forks of a workflow: runs of two or more consecutive flow blocks (functions sit on the
 * shelf and do not break a run) whose `when` reads the same flag with at least two different
 * conditions, none in a parallel group and all in the same loop. A lone `when` block is no fork.
 */
export function forkGroups(wf: Workflow): Fork[] {
  const out: Fork[] = [];
  let run: { flag: string; sig: string; blocks: string[]; conds: Set<string> } | null = null;
  const flush = () => {
    if (run && run.blocks.length >= 2 && run.conds.size >= 2) out.push({ id: "fork:" + run.blocks[0], flag: run.flag, blocks: run.blocks });
    run = null;
  };
  for (const b of wf.blocks) {
    if (b.type === "function") continue;
    const when = whenOf(b);
    let flag = "";
    if (when) {
      try {
        flag = parseCond(when, "when").name;
      } catch {
        flag = "";
      }
    }
    if (!flag || wf.parOf(b.id)) {
      flush();
      continue;
    }
    const sig = wf.loopsOf(b.id).map((l) => l.id).join(",");
    if (run && (run.flag !== flag || run.sig !== sig)) flush();
    if (!run) run = { flag, sig, blocks: [], conds: new Set() };
    run.blocks.push(b.id);
    run.conds.add(when);
  }
  flush();
  return out;
}

function valuesFor(wf: Workflow, given?: Record<string, unknown>): Map<string, FlagValue> | null {
  try {
    return flagValues(cleanFlags(wf.flags), given);
  } catch {
    try {
      return flagValues(cleanFlags(wf.flags));
    } catch {
      return null;
    }
  }
}

/** Block id -> its variant letter, condition and whether the flag values choose it, for every block with a readable `when`. */
export function variantStates(wf: Workflow, given?: Record<string, unknown>): Map<string, VariantInfo> {
  const letters = whenVariants(wf.blocks);
  const values = valuesFor(wf, given);
  const out = new Map<string, VariantInfo>();
  for (const b of wf.blocks) {
    const when = whenOf(b);
    const v = when ? letters.get(when) : undefined;
    if (!when || !v) continue;
    let selected = true;
    if (values) {
      try {
        selected = evalCond(when, values, "when");
      } catch {
        selected = true;
      }
    }
    out.set(b.id, { flag: v.flag, cond: when, letter: v.letter, selected });
  }
  return out;
}

export interface InlineBranch extends BranchRow {
  /** Whether the flag values choose this branch of its chain. */
  chosen: boolean;
}
export interface InlineChainInfo {
  flag: string;
  branches: InlineBranch[];
}
/** The inline `{{#if}}` branching inside one block's text. */
export interface InlineInfo {
  /** The flags the chains read, in order of first use. */
  flags: string[];
  chains: InlineChainInfo[];
  /** Branches across all chains. */
  count: number;
  /** The letter every chain picks, or null when they differ or none applies. */
  letter: string | null;
}

/** The text fields a block's `{{#if}}` can sit in. */
function textsOf(b: Record<string, unknown>): string[] {
  if (b.type === "stage") return [b.name, b.prompt].filter((x): x is string => typeof x === "string");
  if (b.type === "prompt" || b.type === "function") return typeof b.text === "string" ? [b.text] : [];
  return [];
}

/**
 * Block id -> the inline A/B branching in its text, for every stage, prompt block and function that has
 * any, with the branch the flag values choose in each chain. A block whose markers are malformed is left
 * out (`flagProblems` reports it).
 */
export function inlineStates(wf: Workflow, given?: Record<string, unknown>): Map<string, InlineInfo> {
  const values = valuesFor(wf, given);
  const out = new Map<string, InlineInfo>();
  for (const b of wf.blocks) {
    const chains: InlineChainInfo[] = [];
    try {
      for (const t of textsOf(b)) {
        for (const c of inlineChains(t, b.id)) {
          let at = -1;
          if (values) {
            at = c.branches.findIndex((r) => {
              if (r.cond === null) return true;
              try {
                return evalCond(r.cond, values, b.id);
              } catch {
                return false;
              }
            });
          }
          chains.push({ flag: c.flag, branches: c.branches.map((r, i) => ({ ...r, chosen: i === at })) });
        }
      }
    } catch (e) {
      if (e instanceof FlagError) continue;
      throw e;
    }
    if (!chains.length) continue;
    const picks = chains.map((c) => c.branches.find((r) => r.chosen)?.letter ?? null);
    const same = picks.every((l) => l !== null && l === picks[0]);
    const flags = [...new Set(chains.map((c) => c.flag).filter(Boolean))];
    out.set(b.id, { flags, chains, count: chains.reduce((n, c) => n + c.branches.length, 0), letter: same ? (picks[0] as string) : null });
  }
  return out;
}

/** What switching to a block's variant means for the flag values. */
export interface VariantChoice {
  /** The flag the block's `when` reads. */
  flag: string;
  /** The value that makes the `when` hold, or null when no single value does (a `!=` on text, a truthy text flag with no usable default). */
  value: FlagValue | null;
  /** The flag values already choose this block. */
  already: boolean;
}

/**
 * The flag value that makes block `id` the chosen variant. A bool flag takes true or false; a text flag
 * takes the text its `==` names, or its default or empty text when one of those satisfies the condition.
 * Null when the block has no readable `when` on a declared flag.
 */
export function variantChoice(wf: Workflow, given: Record<string, unknown> | undefined, id: string): VariantChoice | null {
  const b = wf.block(id);
  const when = b ? whenOf(b) : "";
  if (!when) return null;
  let cond: ReturnType<typeof parseCond>;
  try {
    cond = parseCond(when, "when");
  } catch {
    return null;
  }
  const def = cleanFlags(wf.flags).find((d) => d.name === cond.name);
  const values = valuesFor(wf, given);
  if (!def || !values) return null;
  const holds = (v: FlagValue): boolean => {
    const probe = new Map(values);
    probe.set(def.name, v);
    try {
      return evalCond(when, probe, "when");
    } catch {
      return false;
    }
  };
  if (holds(values.get(def.name) as FlagValue)) return { flag: def.name, value: values.get(def.name) as FlagValue, already: true };
  const candidates: FlagValue[] = def.type === "bool" ? [true, false] : [cond.lit ?? "", "", def.default];
  const value = candidates.find(holds) ?? null;
  return { flag: def.name, value, already: false };
}
