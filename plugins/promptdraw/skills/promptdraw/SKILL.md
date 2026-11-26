---
name: promptdraw
description: >-
  Write promptdraw workflow files (the YAML the Stages tab opens, saves and exports)
  directly, check them in the app, and hand the user the file plus a link that opens it.
  Use when asked to create, edit, fix or review a promptdraw workflow, a stage workflow or
  a Stages-tab file, or to turn a process into stages, loops and parallel branches.
---

# Writing promptdraw workflows

A workflow is a YAML file that compiles to the `## Workflow` section of an agent prompt in
promptdraw (https://aswinmurali-io.github.io/promptdraw/). The app reads it with a small
hand-rolled YAML subset, not a general YAML library, so shape matters. Don't guess values
or copy them from memory: use `reference.md` and `example.yaml` beside this file.

## Loop: ground, write, check, hand off

1. Read `reference.md` (allowed values, defaults, templates, toggles) and `example.yaml`
   (a full workflow in the exact shape the app writes). Copy its shape.
2. Write `<name>.yaml` where the user wants it.
3. Make the links. `node link.mjs <file.yaml>` (this skill's folder) prints:
   - `open:` the link that opens the workflow in the app,
   - `check:` the same link with `&check`, for you,
   - `length:` and, over 8,000 characters, a note to hand off the file only.

   Without Node, use Python:

   ```python
   import base64, sys, zlib
   c = zlib.compressobj(9, zlib.DEFLATED, -15)
   raw = c.compress(open(sys.argv[1], "rb").read()) + c.flush()
   p = base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
   print("open: https://aswinmurali-io.github.io/promptdraw/#wf=" + p)
   print("check: https://aswinmurali-io.github.io/promptdraw/#wf=" + p + "&check")
   ```

4. Check it.
   - **With a browser tool:** open the **check** link. Check mode never reads or saves
     the user's data, so it is safe in their own browser. Read the "Workflow check" text
     on the page. On `Workflow check: FAIL`, fix the YAML (a load error, a warning, or a
     round-trip difference: the app would rewrite the shown lines, which usually means a
     misspelled key or a non-canonical shape), make new links and check again until it
     says `Workflow check: PASS`. Take a screenshot of the canvas for the user.
   - **Without one:** say the file is unchecked and that the app lists any problems when
     it opens.
5. Show it: by default, open the **open** link in the user's browser yourself (macOS
   `open "<url>"`, Linux `xdg-open`, Windows `start ""`) so they see the workflow without
   asking. Skip this only when the link is over the limit, or the user said not to open it.
6. Hand off: the file path, and the **open** link as a short labelled Markdown link, such
   as `[Open sprint-chaser in promptdraw](<open link>)`. Never hand off the check link. When
   `link.mjs` says the link is over the limit, give the file only: the user opens it with
   **Open…** (`Cmd/Ctrl+O`) or drops it on the canvas. You may still open the long check
   link yourself.

The open link replaces the workflow in the user's app after asking about unsaved changes;
it is not saved to their library until they save it.

## File shape

Top-level keys, in the order the app writes them:

| Key | Notes |
|---|---|
| `name` | Becomes a file-safe slug. Falls back to `untitled`. |
| `version` | `1`. |
| `goal` | One paragraph: what the whole run achieves. |
| `branch`, `worktree`, `commit`, `base` | Optional workspace pins (see `reference.md`); `base` is free text. Unknown values are dropped with a warning. |
| `cancel_grace_minutes`, `on_cancel` | Optional. A list of stages run when the user cancels. |
| `blocks` | Ordered list of blocks. The flow runs top to bottom. |
| `parallels` | Groups of consecutive stages that run side by side. `[]` when none. |
| `loops` | Loops over consecutive blocks. `[]` when none. |

Always write `parallels:` and `loops:`, using `[]` when empty.

### Blocks

Every block has a unique `id` (`b1`, `b2`, ...) and a `type`:

- **`stage`**: `name`, `prompt`; optional `model`, `read_only: true`, `template` (keys in
  `reference.md`). A numbered step.
- **`prompt`**: `text`. A free-text note between steps. Not numbered, and cannot join a
  parallel group.
- **`function`**: `name`, `params: [..]`, `text`; optional `model`. Reusable instructions.
  They sit outside the flow, so they never join a loop or parallel group and add no step.
- **`intentions`**: `toggles: [..]` plus per-option settings. At most one. It adds no
  step; it applies the Task tab's "How to work" options to the whole run. Write every
  setting key `example.yaml` shows. Toggle keys are in `reference.md`.

### Functions: reusable instructions

- A function's `text` holds `{{blank}}` placeholders; `params` lists every blank, each one
  lower-case word (`ticket`, `scope`).
- Call it from a stage, prompt block, another function or a cancel stage with
  `[[Name: blank = value, other = "value, with a comma"]]`. Names match
  case-insensitively and `_` equals a space. Fill every blank; quote values containing a
  comma.
- The app flags unknown functions, unfilled or unknown blanks and bad names.

### Parallel groups

`- id: p1`, `blocks: [b7, b8]`, `join: all|first`: `all` waits for every branch, `first`
stops the rest once one finishes. Needs two or more **stages**, adjacent in `blocks`, and
branches that are independent of each other. A group left with one branch is deleted.

### Loops

`- id: l1`, `blocks: [..]` (adjacent), `agentic`, `mode`, `count`, `reward`, `metric`,
`target`, `max_passes`. Defaults are in `reference.md`.

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

The reader is strict; the writer's output (`example.yaml`) is the safe shape.

- Two-space indent. Lists are `- key: value`, with the item's other keys indented to line
  up with the first key. No nested mappings inside an item, only flat keys.
- Flow lists only as `[a, b, c]`, one line, plain items, no quotes needed.
- Quote any string that is not plain (colons, `#`, leading symbols, very long prose) with
  double quotes, JSON escapes. Multi-line text can use `|` or `|-` block scalars with the
  body indented under the key.
- `true`/`false`, integers and decimals are typed; do not quote them.
- Lines starting with `#` are comments. Keys are `[A-Za-z_][A-Za-z0-9_]*`.
- Unknown keys are ignored (the check's round trip catches them). Ids must be unique. Do not
  add anchors, aliases or nested maps.

## Checklist before handing back

- The check page says `Workflow check: PASS`, or you told the user the file is unchecked.
- Every block id is unique; every id in `parallels` and `loops` exists and is adjacent.
- Every function call matches a function and fills all its blanks.
- `goal` is not empty and every stage says its input, action and output.
- The file is saved where the user wants it, and the hand-off has the open link (or the
  file only, when the link is too long).
