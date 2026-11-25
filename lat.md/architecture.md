# Architecture

promptdraw is a static, client-only React app in three layers: a pure prompt [[core]], the [[ui]] shell, and the [[stages]] editor. No server is involved.

The layers depend in one direction only: `src/ui` imports `src/core`, never the reverse. An ESLint rule in [[eslint.config.js]] rejects React or UI imports inside `src/core`, which keeps the prompt logic testable against the Python original without a DOM.

## Layers

Each layer owns one concern, and the boundaries match the Python app's own module split.

- **Core** (`src/core`): a line-by-line TypeScript port of the Python app's `intentions.py`, `compile.py`, `workflow.py` and the pure parts of `stage_builder.py`. Entry points are [[src/core/compile.ts#buildPrompt]], [[src/core/workflow.ts#Workflow]], [[src/core/yaml.ts#fromYaml]] / [[src/core/yaml.ts#toYaml]], [[src/core/config.ts#loadAppConfig]] and [[src/core/layout.ts#layout]]. See [[core]].
- **Shell** (`src/ui`): [[src/ui/App.tsx#App]] wires the store, the action registry, the floating islands and persistence. See [[ui]].
- **Stage editor** (`src/ui/stages`): the infinite workflow canvas, driven by [[src/ui/stages/useStages.ts#useStages]]. See [[stages]].
- **Tools** (`scripts/`): [[scripts/workflow-tool.ts]], a developer helper for writing workflow YAML. It runs on a developer machine only, never in the build. See [[testing#Workflow authoring tool]].

## Data flow

One reducer holds the Python app's `AppConfig`; everything else is derived from it.

1. A user edit (card toggle, settings field, inspector field, canvas drag) dispatches to the reducer from [[src/ui/state/store.ts#useStore]]. Stage edits are pure `WorkflowDict -> WorkflowDict` functions from [[src/ui/stages/edits.ts]] that call the core `Workflow` edit API.
2. The prompt panel compiles a deferred copy of the config with `buildPrompt(appState(cfg))` ([[src/core/config.ts#appState]]).
3. [[src/ui/state/persistence.ts#useAutosave]] writes the config to `localStorage` as the Python app's `.prompt_builder.json` text via [[src/core/config.ts#serializeAppConfig]].
4. Files leave the app only as downloads (settings JSON, workflow YAML, prompt Markdown) and enter it by Open or drag and drop through [[src/ui/lib/files.ts#importText]].

## Compatibility contract

The app must stay interchangeable with the Python app: same prompt bytes, same files.

- For the same settings and workflow, [[src/core/compile.ts#buildPrompt]] returns exactly the text the Python app's `build_prompt` returns.
- Prompt strings are never retyped: they live in `src/core/constants.json`, dumped once from the Python app's modules and checked in. The generator is not part of this repo, so edit the JSON only to track a change in the original.
- The one exception is in-house names: they were swapped for neutral ones before the dump, so the shipped text says e.g. "Push the branch and open a PR." where the Python app names in-house tools.
- Settings and workflows round-trip through the Python app's own JSON and YAML formats, so a file moves between the two apps unchanged.

## Build output

`npm run build` type-checks and bundles everything into `dist/`, a static site with relative asset URLs. See [[deploy]].
