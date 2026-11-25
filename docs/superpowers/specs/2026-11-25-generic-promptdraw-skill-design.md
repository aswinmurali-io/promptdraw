# Generic promptdraw skill: design

## Intent

Let any local Claude, in any project, design a promptdraw workflow and hand it to the user,
without a promptdraw checkout or its source. Today the `promptdraw` skill only works inside
this repo: it runs `scripts/workflow-tool.ts`, which imports `src/core/`. The app only takes
workflows as files (Open… or drop).

## Goals

- A self-contained skill: everything Claude needs to write valid workflow YAML is in the
  skill folder. No promptdraw source, no repo, no npm package.
- Hand-off as **file plus link**: Claude writes `<name>.yaml` and prints a link to the live
  site that opens the workflow on the Stages canvas.
- Claude checks its work by opening that link in a browser when it has one, and reads the
  app's own load warnings.
- Installable on any machine in one step.

## Non-goals

- Claude building workflows by clicking through the canvas.
- Live two-way sync between Claude and an open app (needs a backend; promptdraw has none).
- Publishing an npm CLI.

## Anti-goals

- The link sends workflow content to a server. It must stay in the URL fragment.
- Opening a link silently destroys unsaved work in the user's app.
- The skill's rules drift from the app's parser without anything failing.

## Constraints

- Static app, no backend; data in `localStorage` per origin.
- Live site: `https://aswinmurali-io.github.io/promptdraw/`.
- Prompt output stays byte-identical to the Python app; this change doesn't touch compile.
- Atomic Conventional Commits on `feat/generic-skill`, no Claude attribution lines.

## Approaches

| | Approach | Trade-off |
|---|---|---|
| A | Skill + bundled `promptdraw.mjs` (app's parser/compiler, 64 KB, `node`) | Checks without a browser; a generated file is committed |
| **B** | **Instructions-only skill + browser check (picked)** | **Smallest; the check needs a browser, otherwise the user sees warnings on open** |
| C | npm `promptdraw` CLI | Always current; release process and network needed |
| — | Drive the canvas in a browser | Slow, token-heavy, brittle; output is YAML anyway |

The user picked B with a browser check: YAML is the app's own format, and the app already
reports load warnings, so the browser gives Claude the real parser without bundling it.

## Design

### 1. App: open a workflow from a link

- Link shape: `<site>/#wf=<payload>`, where payload is base64url (no padding) of the
  workflow YAML's UTF-8 bytes compressed with raw DEFLATE.
- On load, and on `hashchange`, the app reads `#wf=`, decompresses with the browser's
  `DecompressionStream("deflate-raw")`, and passes the text to the existing
  `importText("<name>.yaml", text, cfg)` path in `src/ui/lib/files.ts`.
- It then follows the same path as opening a file (`openFiles` in `App.tsx`): guard unsaved
  stage edits with `stages.discardOk`, replace the workflow, switch to Stages, show the
  "Loaded with changes" dialog for warnings or flash a "Loaded … from link" notice.
- A bad payload (not base64url, not DEFLATE, not YAML) shows the existing error notice
  "Couldn't load workflow …" and changes nothing.
- After handling, the app strips the fragment with `history.replaceState`, so a reload does
  not re-open it and the workflow is not left in the address bar.
- The opened workflow is not saved to the library automatically, as with templates.
#### Check mode (`#wf=<payload>&check`)

Added after the builder check: the browser Claude uses may be the user's real profile, where
a normal open would hit the unsaved-changes guard, autosave over their work and swap other
open tabs. Check mode makes the check safe in any browser and deterministic.

- Decided once at startup from the fragment. The app starts from a blank default config
  instead of `loadStored()`, so the user's data is never read or shown.
- Nothing is written: every `localStorage` write (autosave, prefs, library, intro-seen) is a
  no-op and the `storage` listener is not attached, so other tabs are untouched.
- No intro video, welcome card or discard guard.
- A banner says "Check mode: nothing is saved" with **Open for real**, which navigates to the
  same link without `&check`.
- It shows a **Workflow check** report as plain readable text:
  - `Couldn't load workflow: <reason>` on a parse error; otherwise
  - the workflow name and counts (blocks, parallel groups, loops);
  - `Warnings: none` or the list (the same `fromYaml` warnings the normal open shows);
  - `Round trip: identical` or `Round trip: the app would rewrite this file`, with the first
    differing lines. This catches misspelled keys (`promt:`), which the parser ignores
    silently, without changing the faithful `src/core/` reader.
  - Pass = no load error, no warnings, round trip identical.
- The fragment is not stripped in check mode, so a reload re-runs the check.

- Encoding/decoding lives in a small pure module (`src/ui/lib/link.ts`, or `src/core/` if it
  stays React-free) with unit tests: round trip, Unicode, bad input.

### 2. The skill

Lives in a Claude Code plugin in this repo:

```
.claude-plugin/marketplace.json          # marketplace listing this one plugin
plugins/promptdraw/.claude-plugin/plugin.json
plugins/promptdraw/skills/promptdraw/
  SKILL.md        # loop: write -> link -> browser check -> hand off
  reference.md    # allowed values, defaults, templates, toggles, YAML subset rules
  example.yaml    # one starter workflow in canonical shape
  link.mjs        # node: prints the link for a YAML file (no dependencies)
```

- `SKILL.md` keeps today's content (file shape, blocks, functions, loops, parallels, writing
  well, YAML rules, checklist) but drops every `workflow-tool.ts` command.
- Loop: read `reference.md` and `example.yaml`, write the file, run
  `node link.mjs file.yaml` (prints the open link and the `&check` link), then:
  - **With a browser tool:** open the **check** link, read the Workflow check report. On a
    load error, warnings or a round-trip difference, fix the YAML and repeat until it
    passes. Take a screenshot of the canvas for the user.
  - **Without one:** say the file is unchecked and the app will list any problems on open.
- Hand-off: the file path and the open link (never the check link) as a short labelled
  Markdown link. If the payload is over 8,000 characters, leave the link out of the hand-off
  and tell the user to open the file; Claude still opens the long check link itself.
- `link.mjs` uses Node's `zlib.deflateRawSync`; `SKILL.md` gives a Python one-liner
  fallback (`zlib.compressobj(wbits=-15)`).
- Install: `/plugin marketplace add aswinmurali-io/promptdraw`, then install the
  `promptdraw` plugin. README also documents copying the folder to `~/.claude/skills/`.

### 3. Keeping the skill honest

A Vitest test fails when the skill drifts from the app:

- every value in `reference.md`'s tables matches `STAGE_MODELS`, `JOINS`, `LOOP_DEFAULTS`,
  `WORKSPACE`, `TEMPLATES` and `TOGGLE_ORDER`/`TOGGLE_TEXT`;
- `example.yaml` equals `toYaml` of its starter, and parses with no warnings;
- `link.mjs`'s output decodes, with the app's decoder, back to the input YAML.

`npm run skill:ref` regenerates `reference.md` and `example.yaml` from `src/core`, so fixing
drift is one command.

### 4. Repo housekeeping

- Remove `.claude/skills/promptdraw/` and restore `.gitignore` to ignoring `.claude`; the
  plugin is the one copy.
- `scripts/workflow-tool.ts` stays as a contributor tool and gains a `link <file>` command.
- Update README (install + use), `lat.md/` (link format, skill, drift test), and run
  `lat check`.

## Calls made without the user

- Check mode reports a round-trip difference instead of adding unknown-key warnings to
  `fromYaml`, to keep the core a faithful port of the Python reader.
- The 8,000-character limit is a display limit for the hand-off only.
- Link format, plugin layout, drift test and `npm run skill:ref` are as above.

## Left to the builder

- Exact file for the codec (`src/ui/lib/` vs `src/core/`).
- Wording of notices, as long as the browser check can read them as text.
- How `reference.md` is formatted, provided the drift test can parse it.
