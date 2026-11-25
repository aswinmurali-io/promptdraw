# Prompt core

`src/core` is a pure TypeScript port of the Python app's prompt logic. For the same input it produces byte-identical prompts, YAML and warnings.

It ports `intentions.py`, `compile.py`, `workflow.py` and the pure parts of `stage_builder.py`, and has no React, no DOM and no I/O.

An ESLint rule blocks React and UI imports inside `src/core`, so the UI can change freely without touching prompt output.

## Modules

Each module ports one Python source; names follow the Python ones in camelCase (`build_prompt` is `buildPrompt`).

- **constants** ([[src/core/constants.ts]]) — every prompt string and option list, such as [[src/core/constants.ts#TOGGLE_TEXT]] and [[src/core/constants.ts#TOGGLE_ORDER]], loaded from `constants.json`. That file was dumped once from the Python modules and is checked in, never retyped, so the text stays verbatim.
- **py** ([[src/core/py.ts]]) — Python semantics the port depends on: `str()`, `repr()`, `strip()`, `splitlines()`, truthiness, `int()` / `float()` parsing (including Unicode digits and `_` separators), round-half-even, float `repr`, and `json.dumps`. A [[src/core/py.ts#PyFloat]] wrapper keeps Python's int/float split for values read from YAML or JSON.
- **intentions** ([[src/core/intentions.ts]]) — the fifteen "how to work" toggles: [[src/core/intentions.ts#toggleLine]] renders one, [[src/core/intentions.ts#blockSettings]] reads their settings, validators such as [[src/core/intentions.ts#mockStrength]] clamp values, and [[src/core/intentions.ts#migrateToggles]] maps legacy keys.
- **workflow** ([[src/core/workflow.ts]]) — the [[src/core/workflow.ts#Workflow]] model: blocks, parallel groups, nested loops, function blocks with `[[Name: blank = value]]` uses, on-cancel stages, workspace pins, the grouping repair in `sync()`, the edit API the canvas uses, and [[src/core/workflow.ts#workflowPrompt]] for the `## Workflow` section.
- **yaml** ([[src/core/yaml.ts]]) — the Python app's hand-rolled YAML subset reader ([[src/core/yaml.ts#fromYaml]]) and writer ([[src/core/yaml.ts#toYaml]]). It is ported line by line rather than replaced with a YAML library, because the shipped workflow files depend on its quirks.
- **compile** ([[src/core/compile.ts]]) — [[src/core/compile.ts#buildPrompt]], config migration ([[src/core/compile.ts#migrateState]]), [[src/core/compile.ts#withIntentions]], [[src/core/compile.ts#compileWorkflow]], and the CLI's argument handling as pure functions ([[src/core/compile.ts#cliCompile]]). Anything the Python app shells out for is exposed as a command string to copy ([[src/core/compile.ts#compileCommand]], [[src/core/compile.ts#DARK_MODE_COMMAND]]), never executed.
- **config** ([[src/core/config.ts]]) — the app's saved settings ([[src/core/config.ts#AppConfig]]), read the way the Tk app read `.prompt_builder.json` ([[src/core/config.ts#loadAppConfig]]) and written back in the same JSON format ([[src/core/config.ts#serializeAppConfig]]), so a user's existing file imports and exports unchanged.
- **flags** ([[src/core/flags.ts]]) — prompt flags, promptdraw's own addition: see [[core#Prompt flags]].
- **layout** ([[src/core/layout.ts]]) — [[src/core/layout.ts#layout]] computes the Stages canvas geometry from `stage_builder.py`: text wrapping, card body text, and the automatic left-to-right flow layout with loop frames, parallel lanes, the function shelf and the on-cancel lane.

## Deliberate differences

A few inputs that crash the Python are handled instead, so the browser app never throws on user data.

- An infinite mock strength clamps to 1 or 100 (Python raises `OverflowError`).
- On config import, an unknown branch, worktree or commit falls back to the default (Python stores it and then fails when building the prompt).
- A YAML or config value of the wrong shape (for example a parallel group without `blocks`) is treated as empty instead of raising.
- `YamlError` messages for a bad quoted string carry the JavaScript JSON parser's wording, not Python's.

## Prompt compilation

[[src/core/compile.ts#buildPrompt]] turns one flat settings state into the prompt text and its section chips, in the Python app's fixed section order.

1. **Task or workflow.** On the Task tab, `## Task` with the trimmed task (or a placeholder). On the Stages tab, [[src/core/workflow.ts#workflowPrompt]] renders the `## Workflow` section instead; the workflow's workspace pins override the rail, and its intentions block (via [[src/core/intentions.ts#blockState]]) replaces the rail's toggles, or clears them when there is none.
2. **`## Workspace & git`** — branch (with base), worktree, copy-env and commit lines.
3. **`## Unity`** — spawn or existing instance, plus the instance check.
4. **`## How to work`** — one line per active toggle in [[src/core/constants.ts#TOGGLE_ORDER]], from [[src/core/intentions.ts#toggleLine]]; omitted when none is on.
5. **`## Extra notes`** — Task tab only, when not blank.

promptdraw adds a few options the Python app lacks ([[src/core/constants.ts#EXTRA_TOGGLES]], [[src/core/constants.ts#EXTRA_SETTINGS]]): Self-loop code review (after Basic code review, which it needs: a fresh opus reviewer each pass, fixes in a reward loop until no critical or high finding is left, up to `review_passes`, medium and low fixed or listed per `review_minor`) and a recon worker cap (`recon_count`, at most [[src/core/constants.ts#RECON_COUNT_MAX]], "at most N" in place of "several"). Off or unset they add nothing, and [[src/core/config.ts#appState]] leaves them out of the state and the saved file, so every config the Python app could save still compiles and saves byte for byte.

Sections are joined by blank lines and the prompt ends with one newline. Like the Python, it throws on a missing key or an unknown branch, worktree or commit value. The UI calls it as `buildPrompt(appState(cfg))`, where [[src/core/config.ts#appState]] flattens the saved [[src/core/config.ts#AppConfig]]; [[src/core/compile.ts#compileWorkflow]] is the CLI path, built on the same function.

## Prompt flags

A workflow can declare flags and compile to different prompts from one file: [[src/core/flags.ts#resolveFlagsDict]] decides what a flag set rules out before the normal compile runs, either stripping it or keeping every variant marked.

Not in the Python app: a workflow with no `flags:`, no `when:` and no markers compiles exactly as before (the resolver hands back the same dict), and the Python app's reader would not know the new keys.

- **Declare**: a top-level `flags:` list of `name` (lower-case word), `type` (`bool`, the default, or `text`), `default` and an optional `label`. Read by [[src/core/flags.ts#cleanFlags]], kept on [[src/core/workflow.ts#Workflow]] and written back by the YAML writer.
- **Values**: [[src/core/flags.ts#flagValues]] starts from the defaults and applies what the caller passes (`flags` in [[src/core/compile.ts#compileWorkflow]] and `CliOptions`, or `state.flags` in [[src/core/compile.ts#buildPrompt]]). A bool flag takes true/false, on/off, yes/no or 1/0; a text flag takes any text. A flag nobody declared, or a bool flag given other text, throws [[src/core/flags.ts#FlagError]].
- **Modes** ([[src/core/flags.ts#FlagMode]]): `strip` removes what the flags rule out, so the prompt shows no trace of the other variant. `embed`, the default of [[src/core/compile.ts#buildPrompt]] and the app, keeps every variant, labelled `**Variant A (cond):**` (A, B, C … in branch order, `otherwise` for the else), and says which to follow: `**Use variant A.**` after an `{{#if}}`, or `[Variant A (cond): use]` / `[… : skip, not selected]` on the name of a gated stage (on the text of a prompt or function block). `resolveFlagsDict` itself defaults to `strip`; `flagMode` on `state` and `CliOptions` picks.
- **Whole blocks**: a stage, prompt or function block with `when: <condition>` is dropped when it fails in `strip` mode (the groups around it are repaired like any removal, and later stages renumber) and kept, marked use or skip, in `embed`. An intentions block ignores `when`. [[src/core/flags.ts#whenVariants]] letters a flag's distinct conditions A, B … in document order, so `when: f` and `when: "!f"` read as A and B.
- **Inside text**: `{{#if cond}}…{{#elif cond}}…{{#else}}…{{/if}}` nests, and `{{@flag}}` is replaced by the flag's value. Applied to stage names and prompts, prompt and function text, the goal and cancel stages, before functions expand. A tag alone on its line takes the line with it. Other `{{…}}` text (a `{{blank}}`, a `{{PROJECT_…}}` fill-in) is left alone.
- **Conditions**: `flag`, `!flag`, `flag == value`, `flag != value` (value bare or quoted). A bool flag compares with on/off words; a text flag compares exact text, and counts as true unless empty or `false`/`no`/`off`/`0`/`null`.
- **Forks**: [[src/core/forks.ts#forkGroups]] finds runs of consecutive flow blocks that read one flag with two or more different conditions (not in a parallel group, all in one loop) and [[src/core/layout.ts#layout]] draws each as one frame of stacked lanes, a label row above every card ([[src/core/layout.ts#FORK_LABEL_H]]); edges fan out and in as for a parallel group. [[src/core/forks.ts#variantStates]] says, for the flag values, which blocks are chosen. A fork changes only how the flow is drawn, never the prompt.
- **Saved choices**: [[src/core/config.ts#AppConfig]] keeps `flags` (the chosen values) and `flag_mode`; they reach the file as `flags` / `flagMode` only when set (and only for flags the workflow still declares, via [[src/core/flags.ts#usableFlags]]), so a config the Python app could save is unchanged.
- **Inline branches**: [[src/core/flags.ts#inlineChains]] lists the `{{#if}}` chains of a text with each branch's letter, condition and folded text, and [[src/core/forks.ts#inlineStates]] does that for every stage, prompt block and function of a workflow with the branch the flag values choose in each chain (and the one letter they all agree on). [[src/core/forks.ts#variantChoice]] says which flag value makes a `when` block the chosen variant: true or false for a bool flag, the text an `==` names, or an empty or default value that satisfies it; null when no single value does.
- **Problems**: [[src/core/flags.ts#flagProblems]] reports malformed markers, undeclared flags and declared flags nothing uses, and `fromYaml` returns them with its other warnings.

## Tests

Ported Python unit tests guard the port; see [[testing]] for the suites and how to regenerate constants.
