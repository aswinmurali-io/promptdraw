// Ready-made workflows offered under File ▾ → Templates. Each one runs as written and also
// shows off what a workflow can hold: an intentions block, function blocks used with
// [[Name: blank = value]], parallel branches, reward loops (one nested in another),
// read-only and per-model stages, workspace pins and an on-cancel lane.
// @lat: [[stages#Stage editor#Workflow library#Starter workflows]]
import { Workflow, blockSettings, type WorkflowDict } from "../../core";

export interface Starter {
  key: string;
  label: string;
  hint: string;
  workflow: WorkflowDict;
}

const SPRINT_CHASER: WorkflowDict = {
  name: "sprint-chaser",
  goal:
    "Burn down this sprint: ship as many backlog tickets as the time box allows, highest value first, " +
    "each one meeting every acceptance criterion with passing tests and its own commit.",
  workspace: { commit: "atomic" },
  on_cancel: {
    grace_minutes: 5,
    stages: [
      {
        name: "Park work in progress",
        prompt:
          "Commit the ticket in flight to a `wip/<ticket>` branch with a message saying where it stopped. " +
          "Leave no uncommitted changes and don't touch tickets already shipped.",
      },
      {
        name: "Write the hand-off",
        model: "haiku",
        prompt:
          "Append to `sprint-report.md`: tickets shipped (with commit hashes), the ticket in flight and its " +
          "`wip/` branch, and the `burn_down` score at the moment of cancel.",
      },
    ],
  },
  blocks: [
    {
      id: "b1",
      type: "intentions",
      ...blockSettings({
        toggles: ["assumptions", "high_confidence", "tests", "progress", "review"],
        worker_model: "sonnet",
        recon_model: "opus",
        progress_minutes: 20,
        progress_format: "output",
      }),
    },
    {
      id: "b2",
      type: "function",
      name: "Ticket check",
      params: ["ticket"],
      text:
        "For {{ticket}}: re-read its acceptance criteria, run the tests that cover it, and list every " +
        "criterion as ✅ met or ❌ not met, with the test or command output that proves it. " +
        "`criteria_met` is the share of criteria met, as a percentage.",
    },
    {
      id: "b3",
      type: "function",
      name: "Ship gate",
      params: ["scope"],
      text:
        "Before calling {{scope}} done: lint, type check and the full test suite pass; the diff has no " +
        "debug output, commented-out code or new TODOs; the commit message follows Conventional Commits " +
        "and names the ticket.",
    },
    {
      id: "b4",
      type: "stage",
      name: "Pull the backlog",
      read_only: true,
      model: "sonnet",
      prompt:
        "Find the sprint backlog (`SPRINT.md`, the issue tracker, or ask me for it). List every ticket with " +
        "its id, title, acceptance criteria and story points (estimate S = 1, M = 3, L = 5 when missing). " +
        "Flag any ticket whose criteria are vague and propose a sharper wording.",
    },
    {
      id: "b5",
      type: "stage",
      name: "Plan the burn-down",
      model: "opus",
      prompt:
        "Order the tickets by value ÷ points, keeping dependencies before the tickets that need them. Write " +
        "the order to `sprint-plan.md`, one checkbox per ticket with its points, and the total points planned.",
    },
    {
      id: "b6",
      type: "prompt",
      text:
        "A ticket that is still blocked after its fix loop gives up goes to the bottom of `sprint-plan.md` " +
        "with a one-line reason. Don't spend a third pass on it.",
    },
    {
      id: "b7",
      type: "stage",
      name: "Pick the next ticket",
      prompt: "Take the top unchecked ticket in `sprint-plan.md`, restate its acceptance criteria and name the files it will touch.",
    },
    {
      id: "b8",
      type: "stage",
      name: "Build it",
      prompt: "Implement the ticket with the smallest change that meets every criterion. Match the code around it.",
    },
    {
      id: "b9",
      type: "stage",
      name: "Write the tests",
      model: "sonnet",
      prompt: "From the acceptance criteria alone, write tests that fail without the change: one per criterion, plus the edge cases they imply.",
    },
    {
      id: "b10",
      type: "stage",
      name: "Verify and ship",
      prompt:
        "[[Ticket check: ticket = the current ticket]] Fix whatever is not met. Once every criterion passes, " +
        "[[Ship gate: scope = this ticket]] then commit and tick it in `sprint-plan.md`.",
    },
    {
      id: "b11",
      type: "stage",
      name: "Sprint report",
      model: "haiku",
      prompt:
        "Write `sprint-report.md`: each shipped ticket with its commit, the final `burn_down`, the tickets " +
        "carried over and why, and one line on what slowed the sprint down most.",
    },
  ],
  parallels: [{ id: "p1", blocks: ["b8", "b9"], join: "all" }],
  loops: [
    {
      id: "l1",
      blocks: ["b6", "b7", "b8", "b9", "b10"],
      agentic: true,
      mode: "reward",
      count: 3,
      reward:
        "`burn_down` = 100 × (points of tickets that are ticked and pass Ticket check) ÷ (total points planned). " +
        "A ticked ticket that fails any criterion counts 0, so shipping broken work lowers the score.",
      metric: "burn_down",
      target: 90,
      max_passes: 12,
    },
    {
      id: "l2",
      blocks: ["b8", "b9", "b10"],
      agentic: true,
      mode: "reward",
      count: 3,
      reward: "`criteria_met` from Ticket check on the current ticket: the share of its acceptance criteria that pass, as a percentage.",
      metric: "criteria_met",
      target: 100,
      max_passes: 3,
    },
  ],
};

const COUNCIL_OF_QC_UI: WorkflowDict = {
  name: "council-of-qc-ui",
  goal:
    "Bring one UI screen up to ship quality: a council of five specialist reviewers scores it in parallel, " +
    "the chair merges their verdicts into one fix list, the fixes land, and the council meets again until " +
    "the screen clears its bar.",
  workspace: { commit: "atomic" },
  on_cancel: {
    grace_minutes: 3,
    stages: [
      {
        name: "Revert the half-applied fix",
        prompt:
          "If a fix is half done, revert just that fix so the screen builds and renders again. Keep every " +
          "finished fix committed.",
      },
      {
        name: "Save the council minutes",
        model: "haiku",
        prompt:
          "Write `qc-report.md` with each reviewer's latest score, the `council_score`, and the open issues " +
          "in the chair's order, so the next run can pick up where this one stopped.",
      },
    ],
  },
  blocks: [
    {
      id: "b1",
      type: "intentions",
      ...blockSettings({
        toggles: ["assumptions", "ui", "high_confidence"],
        worker_model: "inherit",
        recon_model: "sonnet",
        progress_minutes: 15,
        progress_format: "output",
      }),
    },
    {
      id: "b2",
      type: "function",
      name: "Verdict",
      params: ["lens", "checks"],
      text:
        "Review the screen through the {{lens}} lens only, using the latest screenshots and the running app. " +
        "Check: {{checks}}. Give a score from 0 to 10 and a list of issues, each with a severity " +
        "(blocker / major / minor), where it is (screenshot and file), and the fix you'd make. Don't edit code.",
    },
    {
      id: "b3",
      type: "function",
      name: "Capture",
      params: ["label"],
      text:
        "Screenshot the screen across this device matrix, each in light and dark mode: small phone 320×568, " +
        "notched phone 393×852 in portrait and landscape with safe-area insets on (iOS Simulator or the browser's " +
        "device mode with `viewport-fit=cover`), tall Android 412×915, foldable inner screen 673×841, tablet " +
        "820×1180 in portrait and landscape, laptop 1440×900 and ultrawide 2560×1080. Add one phone shot with the " +
        "on-screen keyboard open on the main input. Save them under `qc/{{label}}/<device>-<orientation>-<theme>.png` " +
        "and note any console errors while you do.",
    },
    {
      id: "b4",
      type: "stage",
      name: "Set the stage",
      read_only: true,
      model: "sonnet",
      prompt:
        "Run the app and open the screen under review (ask me which one if it isn't clear). " +
        "[[Capture: label = before]] List the components and files that render it.",
    },
    {
      id: "b5",
      type: "stage",
      name: "Visual designer",
      read_only: true,
      model: "opus",
      prompt:
        "[[Verdict: lens = visual design, checks = \"spacing rhythm, alignment, type scale, colour and contrast, consistency with the design system\"]]",
    },
    {
      id: "b6",
      type: "stage",
      name: "Accessibility auditor",
      read_only: true,
      model: "sonnet",
      prompt:
        "[[Verdict: lens = accessibility, checks = \"WCAG 2.2 AA contrast, keyboard path and focus rings, labels and roles, reduced motion, 44 px touch targets\"]]",
    },
    {
      id: "b7",
      type: "stage",
      name: "UX critic",
      read_only: true,
      model: "opus",
      prompt:
        "[[Verdict: lens = usability, checks = \"first-time clarity, empty, loading and error states, copy, steps to finish the main task, feedback after each action\"]]",
    },
    {
      id: "b8",
      type: "stage",
      name: "Front-end engineer",
      read_only: true,
      model: "sonnet",
      prompt:
        "[[Verdict: lens = implementation, checks = \"layout breakage and overflow, console errors, hard-coded values that should be tokens, responsive behaviour between breakpoints\"]]",
    },
    {
      id: "b12",
      type: "stage",
      name: "Device QA",
      read_only: true,
      model: "sonnet",
      prompt:
        "[[Verdict: lens = device layouts, checks = \"every shot in the device matrix; safe areas: nothing under the notch, Dynamic Island, rounded corners or home indicator, with env(safe-area-inset-*) padding on fixed bars and sheets; portrait and landscape; aspect ratios from 9:21 phones to 21:9 ultrawide without stretched or stranded content; full-height layouts using dvh so browser chrome and the on-screen keyboard don't hide actions; no horizontal scroll; 200% text zoom\"]]",
    },
    {
      id: "b9",
      type: "stage",
      name: "Chair the council",
      model: "opus",
      prompt:
        "Merge the five verdicts into one fix list: drop duplicates, settle conflicts between reviewers " +
        "(accessibility wins ties), and order by severity. Record each reviewer's score and the " +
        "`council_score` for this pass in `qc-report.md`.",
    },
    {
      id: "b10",
      type: "stage",
      name: "Apply the fixes",
      prompt:
        "Fix every blocker and major issue in the chair's order, one atomic commit per fix. " +
        "Then [[Capture: label = after]] so the next council sees the new screen.",
    },
    {
      id: "b11",
      type: "stage",
      name: "Before / after report",
      model: "haiku",
      prompt:
        "Finish `qc-report.md`: before and after screenshots side by side, the scores per reviewer per " +
        "pass, the fixes made, and the minor issues left for later.",
    },
  ],
  parallels: [{ id: "p1", blocks: ["b5", "b6", "b7", "b8", "b12"], join: "all" }],
  loops: [
    {
      id: "l1",
      blocks: ["b5", "b6", "b7", "b8", "b12", "b9", "b10"],
      agentic: true,
      mode: "reward",
      count: 3,
      reward:
        "`council_score` = the lowest of the five reviewers' scores (0–10), minus 1 for every open blocker. " +
        "The weakest lens sets the score, so one glowing review can't hide a broken one.",
      metric: "council_score",
      target: 8,
      max_passes: 4,
    },
  ],
};

const lens = (id: string, name: string, model: string, l: string, practices: string) => ({
  id,
  type: "stage",
  name,
  read_only: true,
  model,
  prompt: `[[Audit lens: lens = ${l}, practices = "${practices}"]]`,
});

const HOLY_AUDIT: WorkflowDict = {
  name: "the-holy-audit-of-engineer",
  goal:
    "Audit this codebase against every engineering practice that matters, whatever the language: find the flaws " +
    "with evidence, rank them by risk, fix the ones that are safe to fix now, and leave an actionable roadmap and " +
    "guardrails for the rest.",
  workspace: { commit: "atomic" },
  on_cancel: {
    grace_minutes: 5,
    stages: [
      {
        name: "Stop on a green commit",
        prompt: "Revert the fix in flight so the last commit builds and passes its tests. Keep every finished fix.",
      },
      {
        name: "Publish what was found",
        model: "haiku",
        prompt:
          "Write `audit/report.md` from the findings so far: the scorecard, every finding with its fix card, which " +
          "ones were fixed (with commits), and the `holiness_score` at cancel.",
      },
    ],
  },
  blocks: [
    {
      id: "b1",
      type: "intentions",
      ...blockSettings({
        toggles: ["assumptions", "recon", "workers", "high_confidence", "tests", "progress"],
        worker_model: "sonnet",
        recon_model: "opus",
        progress_minutes: 20,
        progress_format: "output",
      }),
    },
    {
      id: "b2",
      type: "function",
      name: "Audit lens",
      params: ["lens", "practices"],
      text:
        "Audit the whole codebase through the {{lens}} lens only, using `audit/map.md` and `audit/instruments/`. " +
        "For each practice in {{practices}}, give:\n\n" +
        "- a verdict: pass, partial, fail or not applicable (say why it doesn't apply);\n" +
        "- evidence: file:line, a command and its output, or a git log query. No evidence, no finding;\n" +
        "- severity: critical, high, medium or low, from impact × likelihood, with one line on what breaks and for whom;\n" +
        "- a fix card: the concrete change and where, effort S (< 1 h), M (< 1 day) or L, and the check that proves it fixed.\n\n" +
        "Number findings `<LENS>-<n>`. Judge practices by intent, not by one language's idiom. Score the lens 0–10 " +
        "and write it all to your report location as `audit/lenses/{{lens}}.md`. Don't edit code.",
    },
    {
      id: "b3",
      type: "function",
      name: "Fix card",
      params: ["finding"],
      text:
        "Fix {{finding}} at its root cause with the smallest change that does it. First add a test, lint rule or " +
        "CI check that fails on the flaw, then make it pass. Re-run the finding's evidence command to prove it is " +
        "gone and the full test suite to prove nothing else broke. One atomic commit naming the finding id. If the " +
        "fix needs a product decision, a risky migration or more than an L effort, stop and move it to the roadmap " +
        "with the trade-off instead.",
    },
    {
      id: "b4",
      type: "stage",
      name: "Map the territory",
      read_only: true,
      model: "opus",
      prompt:
        "Build `audit/map.md` in your report location: languages and frameworks, how it builds, runs, tests and deploys, entry points, the " +
        "critical user paths, data stores and external services, trust boundaries, and who owns what. From git " +
        "history, list churn hotspots (files changed most in the last year), bus factor per area, and the commits " +
        "that were reverts or hotfixes. Ask me what is out of scope before going on.",
    },
    {
      id: "b5",
      type: "stage",
      name: "Run the instruments",
      read_only: true,
      model: "sonnet",
      prompt:
        "Run the project's own tools and the ecosystem's standard ones, and save raw output to `audit/instruments/` in your report location: " +
        "clean build from scratch, the test suite with coverage and timing (run it twice to catch flaky tests), " +
        "linters and type checkers, the dependency vulnerability audit and outdated report, a secret scan over full " +
        "git history, a licence scan, complexity and duplication metrics, and churn × complexity to find the risky " +
        "files. Note every tool that is missing: a missing tool is itself a finding.",
    },
    lens(
      "b6",
      "Architecture & design",
      "opus",
      "architecture",
      "clear module boundaries with high cohesion and low coupling; dependencies point toward stable abstractions; no dependency cycles; separation of concerns and layering kept; side effects at the edges with a pure core; no leaking abstractions or god objects; one way to do each thing; dead code and speculative generality removed; key decisions recorded as ADRs",
    ),
    lens(
      "b7",
      "Code health",
      "sonnet",
      "code health",
      "names that say what and why; small functions with one job; low cyclomatic and cognitive complexity; no copy-paste duplication; no magic numbers or strings; consistent error handling; comments explain why not what; no commented-out code; TODOs tracked with owners; formatter and linter clean and enforced; types or schemas at every boundary; no deprecated APIs",
    ),
    lens(
      "b8",
      "Testing",
      "sonnet",
      "testing",
      "critical paths covered, judged by risk not coverage percent; a healthy pyramid of fast unit tests, fewer integration and end-to-end tests; deterministic tests with no sleeps, real clocks or order dependence; no flaky tests; assertions that would catch a real bug (sample mutation testing on a hot file); contract tests at service boundaries; regression tests for past incidents; the suite runs in minutes; tests run in CI on every change",
    ),
    lens(
      "b9",
      "Security",
      "opus",
      "security",
      "OWASP Top 10 2025: broken access control including SSRF, security misconfiguration, software supply chain failures, cryptographic failures, injection, insecure design, authentication failures, software and data integrity failures, logging and alerting failures, mishandling of exceptional conditions; plus no secrets in code or history, least privilege for services and tokens, validation and encoding at every trust boundary, secure defaults, and a written threat model for the critical paths",
    ),
    lens(
      "b10",
      "Reliability & operability",
      "sonnet",
      "reliability",
      "timeouts on every network call; retries with backoff and jitter only on idempotent operations; idempotency keys for writes; graceful degradation and shutdown; no resource leaks; safe concurrency without races or deadlocks; structured logs with correlation ids, metrics and traces; SLOs with alerts on user-facing symptoms; health and readiness checks; runbooks for each alert; backups with a tested restore; config from the environment, not code; feature flags for risky changes",
    ),
    lens(
      "b11",
      "Performance & efficiency",
      "sonnet",
      "performance",
      "no accidental quadratic work on hot paths; no N+1 queries; bounded queries, collections, queues and payloads with pagination; caching with clear invalidation; no blocking I/O on hot or UI threads; memory and startup within budget; indexes for real query patterns; performance budgets or benchmarks guarded in CI",
    ),
    lens(
      "b12",
      "Delivery & supply chain",
      "sonnet",
      "delivery",
      "one-command setup and build for a new engineer; reproducible builds with pinned toolchains and lockfiles; CI on every change with required review and branch protection; short-lived branches merged often; automated dependency updates; SBOM and signed artifacts with build provenance (SLSA build level 2 or better); deploys that are automated, repeatable and reversible with tested rollback; backward-compatible, reversible migrations; DORA metrics from git and CI history: deployment frequency, lead time for changes, change failure rate, failed deployment recovery time and rework rate",
    ),
    lens(
      "b13",
      "Data, APIs & knowledge",
      "sonnet",
      "data and docs",
      "API contracts written down, versioned and backward compatible; input validated against a schema at every boundary; personal data minimised, encrypted and given a retention rule; README that gets a newcomer running; architecture overview and ADRs current; changelog and semantic versioning; clear ownership per area; licences compatible; accessibility and internationalisation wherever there is a UI",
    ),
    {
      id: "b14",
      type: "stage",
      name: "The grand inquisitor",
      model: "opus",
      prompt:
        "Read every lens report and write `audit/report.md`. Merge duplicates and cluster findings that share one " +
        "root cause into a single fix. Rank by risk ÷ effort, where risk is severity × likelihood. Give a scorecard " +
        "per lens, the starting `holiness_score`, the ten most important fixes, quick wins (effort S), and a " +
        "Now / Next / Later roadmap. Every item keeps its finding ids, evidence and fix card.",
    },
    {
      id: "b15",
      type: "prompt",
      text:
        "Only Now items that can be fixed with high confidence get fixed below. Anything that needs a product " +
        "decision, a risky migration or a large rewrite stays in the roadmap as a proposal with its trade-off.",
    },
    {
      id: "b16",
      type: "stage",
      name: "Absolve the sins",
      prompt: "[[Fix card: finding = the top open Now item in audit/report.md]] Then tick it in the report with the commit hash.",
    },
    {
      id: "b17",
      type: "stage",
      name: "Re-audit",
      model: "sonnet",
      prompt:
        "Re-run the instruments that bear on the fixed findings and the full test suite. Confirm each fix holds and " +
        "that no new finding appeared, then recompute the lens scores and `holiness_score` in `audit/report.md`.",
    },
    {
      id: "b18",
      type: "stage",
      name: "Deliver the verdict",
      model: "haiku",
      prompt:
        "Finish `audit/report.md`: before and after scorecard, every fix with its commit, the remaining roadmap with " +
        "effort and owner, and the guardrails that stop each fixed class of flaw coming back (lint rules, CI checks, " +
        "pre-commit hooks, review checklist items).",
    },
  ],
  parallels: [{ id: "p1", blocks: ["b6", "b7", "b8", "b9", "b10", "b11", "b12", "b13"], join: "all" }],
  loops: [
    {
      id: "l1",
      blocks: ["b15", "b16", "b17"],
      agentic: true,
      mode: "reward",
      count: 3,
      reward:
        "`holiness_score` = 10 × the weighted mean of the eight lens scores (security and reliability count double), " +
        "minus 10 for each open critical finding and 3 for each open high one, floored at 0. A pass whose fix breaks " +
        "a test or adds a new finding is reverted and scores as the pass before it.",
      metric: "holiness_score",
      target: 85,
      max_passes: 10,
    },
  ],
};

export const STARTERS: Starter[] = [
  { key: "sprint-chaser", label: "Sprint Chaser", hint: "burn down a backlog", workflow: SPRINT_CHASER },
  { key: "council-of-qc-ui", label: "Council of QC UI", hint: "reviewers score a screen", workflow: COUNCIL_OF_QC_UI },
  { key: "the-holy-audit-of-engineer", label: "The Holy Audit of Engineer", hint: "audit every practice, fix what's safe", workflow: HOLY_AUDIT },
];

/** A fresh, cleaned copy of a starter (through Workflow, so it is exactly what the editor would hold). */
export function starterWorkflow(key: string): WorkflowDict | null {
  const s = STARTERS.find((t) => t.key === key);
  return s ? new Workflow(s.workflow).toDict() : null;
}
