# promptdraw reference

Generated from promptdraw's source by `npm run skill:ref`; do not edit by hand. Values not
listed here are dropped with a load warning.

## Stage and function models (`model:`)

`fable`, `opus`, `sonnet`, `haiku`

## Parallel joins (`join:`)

- `all`: wait for every branch.
- `first`: stop the other branches once one finishes.

Allowed: `all`, `first`

## Loop defaults

| Key | Default |
|---|---|
| `agentic` | `true` |
| `mode` | `count` |
| `count` | `3` |
| `reward` | `""` |
| `metric` | `""` |
| `target` | `95` |
| `max_passes` | `8` |

`mode` is `count` or `reward`.

## Workspace keys (top level)

| Key | Allowed values |
|---|---|
| `branch` | `same`, `new`, `off` |
| `worktree` | `per_task`, `none`, `off` |
| `commit` | `atomic`, `combined`, `none` |
| `base` | free text |

## Stage templates (`template:`)

| Key | Name | What it does |
|---|---|---|
| `recon` | Recon | Read-only map of the code |
| `architecture_audit` | Architecture audit | Boundaries, coupling, ranked findings |
| `ui_critique` | UI critique | Screenshot, then design-critique |
| `code_review` | Code review | Review the diff, fix findings |

## Intentions toggles (`toggles:`), in prompt order

| Key | Option |
|---|---|
| `assumptions` | Reduce assumptions |
| `superpowers` | Superpowers |
| `unity_cli` | Nudge Unity CLI usage |
| `recon` | Recon via workers |
| `workers` | Multiple workers |
| `inline` | Inline agent only |
| `high_confidence` | High-confidence fixes only |
| `progress` | Progress reports |
| `dashboard` | Basic dashboard |
| `ui` | UI intelligence |
| `mocks` | Mock iterations |
| `tests` | Tests matter |
| `android_cdp` | Test on Android emulator (CDP) |
| `review` | Basic code review |
| `review_loop` | Self-loop code review |
| `pr` | Push PR |

## Starter workflows

The app's Demo workflows. `example.yaml` is the first, in canonical shape.

- `sprint-chaser`: Sprint Chaser, burn down a backlog
- `council-of-qc-ui`: Council of QC UI, reviewers score a screen
- `the-holy-audit-of-engineer`: The Holy Audit of Engineer, audit every practice, fix what's safe
