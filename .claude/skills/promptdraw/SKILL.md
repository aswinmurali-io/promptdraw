---
name: promptdraw
description: >-
  Write promptdraw workflow files (the YAML the Stages tab opens, saves and exports)
  directly, without the UI. Use when asked to create, edit, fix or review a workflow
  YAML, a stage workflow, or a Stages-tab file, or to turn a process into stages,
  loops and parallel branches.
---

# Writing promptdraw workflow YAML

A workflow is a YAML file that compiles to the `## Workflow` section of an agent prompt.
The file is read by a small hand-rolled YAML subset, not a general YAML library, so shape
matters. Do not guess values or copy them from memory: **ask the tool**, which reads the
live source.

## Loop: ground, write, validate

Run from the repo root.

```bash
npx vite-node scripts/workflow-tool.ts constants          # allowed values, defaults, templates, toggles
npx vite-node scripts/workflow-tool.ts starters           # built-in example workflows
npx vite-node scripts/workflow-tool.ts example <key>      # one as YAML: copy its shape
npx vite-node scripts/workflow-tool.ts validate file.yaml # warnings + round-trip check
npx vite-node scripts/workflow-tool.ts prompt file.yaml   # the prompt it compiles to
```

1. Run `constants` and one `example` close to what you are building.
2. Write the file.
3. Run `validate` until it says "No warnings" and "Round trip: identical". Exit code 1
   means warnings.
4. Run `prompt` and read it as the agent would: is every step clear, in order, and free of
   `<describe the goal here>`-style placeholders?

If something here disagrees with the tool, the tool wins. Deeper background lives in
`lat.md/stages.md` and `lat.md/core.md`; the model and rules are in `src/core/workflow.ts`
and the reader and writer in `src/core/yaml.ts`.

## File shape

Top-level keys, in the order the app writes them:

| Key | Notes |
|---|---|
| `name` | Becomes a file-safe slug. Falls back to `untitled`. |
| `version` | `1`. |
| `goal` | One paragraph: what the whole run achieves. |
| `branch`, `worktree`, `commit`, `base` | Optional workspace pins. Values from `constants` (`WORKSPACE`); `base` is free text. Unknown values are dropped with a warning. |
| `cancel_grace_minutes`, `on_cancel` | Optional. A list of stages run when the user cancels. |
| `blocks` | Ordered list of blocks. The flow runs top to bottom. |
| `parallels` | Groups of consecutive stages that run side by side. `[]` when none. |
| `loops` | Loops over consecutive blocks. `[]` when none. |

Always write `parallels:` and `loops:`, using `[]` when empty.

### Blocks

Every block has a unique `id` (`b1`, `b2`, ...) and a `type`:

- **`stage`**: `name`, `prompt`; optional `model` (from `STAGE_MODELS`), `read_only: true`,
  `template` (a key from `constants`). A numbered step.
- **`prompt`**: `text`. A free-text note between steps. Not numbered, and cannot join a
  parallel group.
- **`function`**: `name`, `params: [..]`, `text`; optional `model`. Reusable instructions.
  They sit outside the flow, so they never join a loop or parallel group and add no step.
- **`intentions`**: `toggles: [..]` plus per-option settings. At most one. It adds no
  step; it applies the Task tab's "How to work" options to the whole run. Write every
  setting key the example shows. Toggle keys and what they say come from `constants`.

### Functions: reusable instructions

- A function's `text` holds `{{blank}}` placeholders; `params` lists every blank, each one
  lower-case word (`ticket`, `scope`).
- Call it from a stage, prompt block, another function or a cancel stage with
  `[[Name: blank = value, other = "value, with a comma"]]`. Names match
  case-insensitively and `_` equals a space. Fill every blank; quote values containing a
  comma.
- `validate` reports unknown functions, unfilled or unknown blanks and bad names.

### Parallel groups

`- id: p1`, `blocks: [b7, b8]`, `join: all|first` (see `JOINS`): `all` waits for every
branch, `first` stops the rest once one finishes. Needs two or more **stages**, adjacent in
`blocks`, and branches that are independent of each other. A group left with one branch is
deleted.

### Loops

`- id: l1`, `blocks: [..]` (adjacent), `agentic`, `mode`, `count`, `reward`, `metric`,
`target`, `max_passes`. Defaults are in `LOOP_DEFAULTS`.

- `agentic: false`: the agent shows the result and asks before each pass.
- `agentic: true, mode: count`: run `count` passes without asking.
- `agentic: true, mode: reward`: `reward` says how to score a pass, `metric` names the
  number reported, and the loop stops at `target` or after `max_passes`. Make the reward
  concrete and checkable (a command, a count, a percentage), never "make it good".
- Loops wrap whole units: all branches of a parallel group, or whole inner loops. A loop
  nests inside another or wraps it, but never cuts across it. Anything that breaks these
  rules is dropped with a warning.

## Writing the content well

- A stage prompt is an instruction to an agent that has not seen the others: say the input,
  the action and the output (a file to write, a list to produce).
- Use `read_only: true` for stages that only report (audits, recon, review). Put cheap
  models on mechanical stages and strong ones on planning.
- Put repeated instructions in a function instead of pasting them.
- Prefer a loop with a measurable reward for "keep going until it is good", a parallel group
  for independent checks, and a plain sequence otherwise.
- Prefer `intentions` for the process rules every step should follow (tests, review,
  progress reports) instead of repeating them in each stage.
- Use `on_cancel` to leave work safe (commit to a `wip/` branch, write a hand-off).

## YAML subset rules

The reader is strict; the writer's output is the safe shape.

- Two-space indent. Lists are `- key: value`, with the item's other keys indented to line
  up with the first key. No nested mappings inside an item, only flat keys.
- Flow lists only as `[a, b, c]`, one line, plain items, no quotes needed.
- Quote any string that is not plain (colons, `#`, leading symbols, very long prose) with
  double quotes, JSON escapes. Multi-line text can use `|` or `|-` block scalars with the
  body indented under the key.
- `true`/`false`, integers and decimals are typed; do not quote them.
- Lines starting with `#` are comments. Keys are `[A-Za-z_][A-Za-z0-9_]*`.
- Unknown keys are ignored. Ids must be unique. Do not add anchors, aliases or nested maps.

## Checklist before handing back

- `validate` shows no warnings and an identical round trip.
- Every block id is unique; every id in `parallels` and `loops` exists and is adjacent.
- Every function call matches a function and fills all its blanks.
- `prompt` reads sensibly end to end and `goal` is not empty.
- The file is saved where the user wants it. In the app they open it with **Open…**
  (`Cmd/Ctrl+O`) or by dropping it on the canvas.
