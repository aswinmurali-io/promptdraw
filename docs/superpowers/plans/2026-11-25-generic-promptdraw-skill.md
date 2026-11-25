# Generic promptdraw Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any local Claude can write a promptdraw workflow, check it in a browser through a safe check mode, and hand the user a YAML file plus a link that opens it in the live app.

**Architecture:** The app learns to read `#wf=<payload>` links (raw-DEFLATE + base64url YAML) and, with `&check`, runs in an isolated in-memory-storage check mode that prints a Workflow check report. The skill ships as a Claude Code plugin in this repo: instructions, a generated reference, an example, and a dependency-free `link.mjs`. A Vitest drift test keeps the generated files equal to what `src/core` produces.

**Tech Stack:** Vite, React 18, TypeScript, Vitest + Testing Library (jsdom), Playwright, browser `DecompressionStream`, Node `zlib`.

**Spec:** `docs/superpowers/specs/2026-11-25-generic-promptdraw-skill-design.md`

## Global Constraints

- Branch `feat/generic-skill`; one logical change per commit; Conventional Commits; **no `Co-Authored-By` or other Claude attribution lines**.
- Link shape: `<site>/#wf=<payload>` and `<site>/#wf=<payload>&check`; payload = base64url, no padding, of raw-DEFLATE of the YAML's UTF-8 bytes.
- Live site: `https://aswinmurali-io.github.io/promptdraw/`.
- Workflow content stays in the URL fragment; never in a path or query string.
- Hand-off link limit: 8,000 payload characters (display limit only; the check still runs).
- `src/core/` stays React-free and is not changed: no unknown-key warnings in `fromYaml`.
- Check mode banner copy: `Check mode: nothing is saved`; button `Open for real`.
- Check report lines: `Workflow check: PASS|FAIL`, `Couldn't load workflow: <reason>`, `Warnings: none`, `Round trip: identical`, `Round trip: the app would rewrite this file`.
- Every task updates the `lat.md/` section it touches and ends with `lat check` passing; `npm test`, `npm run lint`, `npm run typecheck` pass before each commit.

## Review Focus

1. A real browser profile with saved work opens a `&check` link: stored config, task, prefs and library must be byte-identical afterwards, and another open tab must not switch (Task 3 e2e).
2. A normal link opened while the user has unsaved stage edits must ask before replacing them (Task 2 test).
3. A truncated or hand-edited link (bad base64url, bad DEFLATE, YAML error) must show an error and leave the workflow untouched (Tasks 1, 2, 4 tests).
4. Non-ASCII workflow text (accents, CJK, emoji) must survive Node encode → browser decode exactly (Task 1 fixture test, Task 5 test).
5. Pasting a second link into an already open tab must open it (hashchange), and switching between check and normal links must reload into the right mode (Task 2, Task 3 tests).

---

### Task 1: Link codec

**Files:**
- Create: `src/ui/lib/link.ts`
- Test: `src/ui/lib/link.test.ts`

**Interfaces:**
- Produces:
  - `class LinkError extends Error`
  - `encodePayload(yaml: string): Promise<string>`
  - `decodePayload(payload: string): Promise<string>` (throws `LinkError`)
  - `parseLinkHash(hash: string): { payload: string; check: boolean } | null`
  - `buildLink(base: string, payload: string, check?: boolean): string`
  - `const SITE_URL = "https://aswinmurali-io.github.io/promptdraw/"`
  - `const LINK_LIMIT = 8000`

- [ ] **Step 1: Write the failing tests**

```ts
it("round-trips ASCII and Unicode", async () => {
  for (const s of ["name: hi\n", 'goal: "Résumé ✓ 日本 🚀"\n'])
    expect(await decodePayload(await encodePayload(s))).toBe(s);
});
it("decodes payloads made by Node zlib.deflateRawSync", async () => {
  expect(await decodePayload("y0vMTbVSyMjkAgA")).toBe("name: hi\n");
  expect(await decodePayload("S89PzLFSUAo6vLK4NPfwSoVHcyYrPJu-9NmcNUpcAA")).toBe('goal: "Résumé ✓ 日本"\n');
});
it("encodes to base64url without padding", async () => {
  expect(await encodePayload("x".repeat(500))).toMatch(/^[A-Za-z0-9_-]+$/);
});
it("rejects bad payloads with LinkError", async () => {
  await expect(decodePayload("!!!")).rejects.toBeInstanceOf(LinkError);
  await expect(decodePayload("AAAA")).rejects.toBeInstanceOf(LinkError);
});
it("parses link hashes", () => {
  expect(parseLinkHash("#wf=abc")).toEqual({ payload: "abc", check: false });
  expect(parseLinkHash("#wf=abc&check")).toEqual({ payload: "abc", check: true });
  for (const h of ["", "#", "#wf=", "#other=1"]) expect(parseLinkHash(h)).toBeNull();
});
it("builds links", () => {
  expect(buildLink(SITE_URL, "abc")).toBe("https://aswinmurali-io.github.io/promptdraw/#wf=abc");
  expect(buildLink(SITE_URL, "abc", true)).toBe("https://aswinmurali-io.github.io/promptdraw/#wf=abc&check");
});
```

- [ ] **Step 2: Run** `npx vitest run src/ui/lib/link.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement `src/ui/lib/link.ts`** with `CompressionStream`/`DecompressionStream("deflate-raw")` over `TextEncoder`/`TextDecoder({ fatal: true })`; wrap every decode failure in `LinkError`.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `git add src/ui/lib/link.ts src/ui/lib/link.test.ts && git commit -m "feat: add a workflow link codec"`

### Task 2: Open workflows from `#wf=` links

**Files:**
- Modify: `src/ui/App.tsx` (`openFiles` ~293-310: extract the apply step; add the link effect)
- Test: `src/ui/App.test.tsx`
- Docs: `lat.md/ui.md` — new `## Workflow links` section under `# App shell`; mention in `## Persistence and files`

**Interfaces:**
- Consumes: Task 1 `parseLinkHash`, `decodePayload`, `LinkError`; `importText` from `src/ui/lib/files.ts`.
- Produces: in `App.tsx`, `applyImport(res: ImportResult, message: string): void` used by both `openFiles` and the link handler.

Behaviour: on mount and on `hashchange`, when `parseLinkHash(location.hash)` returns `{ check: false }`, decode, call `importText("link.yaml", text, cfg)`, then the same guarded apply as a file (`stages.discardOk`). Success toast `Loaded <workflow name> from link`; warnings use the existing "Loaded with changes" dialog. Failure toast `Couldn't load workflow from link: <reason>` (error tone), config unchanged. In every case strip the fragment with `history.replaceState(null, "", location.pathname + location.search)`.

- [ ] **Step 1: Write failing tests** in `App.test.tsx`, `describe("workflow links")`:
  - `opens a #wf= link on the Stages tab and clears the hash`: set `location.hash = "#wf=" + await encodePayload(toYaml(new Workflow(starterWorkflow("sprint-chaser")!)))`, render, expect the Stages tab selected, the text `Sprint Chaser` on the board, and `location.hash === ""`.
  - `asks before replacing unsaved stage edits`: render, make a stage edit, then set the hash and dispatch `hashchange`; expect the existing unsaved-changes confirm dialog, and the old workflow kept after cancelling.
  - `opens a second link pasted into an open tab` via `hashchange`.
  - `reports a broken link and changes nothing`: hash `#wf=!!!`; expect toast text starting `Couldn't load workflow from link:` and the default workflow.
- [ ] **Step 2: Run** `npx vitest run src/ui/App.test.tsx -t "workflow links"` — Expected: FAIL.
- [ ] **Step 3: Implement** in `App.tsx`.
- [ ] **Step 4: Run** the same — Expected: PASS; then `npm test`.
- [ ] **Step 5: Update `lat.md/ui.md`, run `lat check`, commit** `feat: open workflows from #wf= links`

### Task 3: Check mode isolation

**Files:**
- Create: `src/ui/state/checkMode.ts`, `src/ui/state/checkMode.test.ts`, `e2e/checkMode.e2e.ts`
- Modify: `src/main.tsx` (call before render), `src/ui/state/persistence.ts` (`useAutosave` skips the `storage` listener in check mode), `src/ui/App.tsx` (no intro, no welcome in check mode; Task 2's link handler ignores check links; on `hashchange` whose check flag differs from the startup mode, `location.reload()`)
- Docs: `lat.md/ui.md` — `### Check mode` under `## Workflow links`; `lat.md/testing.md` — `## End-to-end tests` mentions the check-mode e2e

**Interfaces:**
- Consumes: Task 1 `parseLinkHash`.
- Produces:
  - `initCheckMode(hash: string): boolean` — decides once; when true calls `installMemoryStorage()`.
  - `isCheckMode(): boolean`
  - `installMemoryStorage(): void` — `Object.defineProperty(window, "localStorage", { value: new MemoryStorage(), configurable: true })`
  - `class MemoryStorage implements Storage`

- [ ] **Step 1: Write failing unit tests** (`checkMode.test.ts`): `MemoryStorage` get/set/remove/clear/length/key; `initCheckMode("#wf=abc&check")` returns true and afterwards `localStorage.setItem("k","v")` does not reach the original storage; `initCheckMode("#wf=abc")` returns false. Restore the original `localStorage` in `afterEach`.
- [ ] **Step 2: Write failing e2e** (`checkMode.e2e.ts`): seed real `localStorage` with a saved workflow and prefs via `addInitScript` on `/`, snapshot all `promptdraw:*` keys, open a second page on `/`, then go to `/#wf=<payload of sprint-chaser>&check` in the first; wait for `Workflow check:` text (Task 4 renders it; until then assert the banner `Check mode: nothing is saved`); assert the snapshot is unchanged and the second page still shows its own workflow. Assert no intro dialog.
- [ ] **Step 3: Run** `npx vitest run src/ui/state/checkMode.test.ts` and `npx playwright test e2e/checkMode.e2e.ts` — Expected: FAIL.
- [ ] **Step 4: Implement** the module and wiring; render the banner (`Check mode: nothing is saved`, `Open for real` → `location.assign(buildLink(location.origin + location.pathname, payload))` then `location.reload()`).
- [ ] **Step 5: Run** both — Expected: PASS; then `npm test`, `npm run e2e`.
- [ ] **Step 6: Update `lat.md/`, run `lat check`, commit** `feat: add an isolated check mode for workflow links`

### Task 4: Workflow check report

**Files:**
- Create: `src/ui/lib/check.ts`, `src/ui/lib/check.test.ts`, `src/ui/components/CheckReport.tsx`
- Modify: `src/ui/App.tsx` (in check mode: decode the payload, load it without the discard guard, switch to Stages, render `CheckReport`; keep the hash)
- Test: `src/ui/App.test.tsx`, `e2e/checkMode.e2e.ts` (now assert `Workflow check: PASS`)
- Docs: `lat.md/ui.md` `### Check mode` — report lines and pass rule

**Interfaces:**
- Consumes: `fromYaml`, `toYaml`, `YamlError` from `src/core`; Task 1 decode; Task 3 `isCheckMode`.
- Produces:
  ```ts
  type CheckResult =
    | { ok: false; error: string }
    | { ok: true; name: string; blocks: number; parallels: number; loops: number;
        warnings: string[]; identical: boolean;
        diff: { line: number; yours: string; app: string }[]; // first 5 differing lines, 1-based
        pass: boolean };
  checkWorkflow(text: string): CheckResult
  reportText(r: CheckResult): string // the exact lines from Global Constraints
  ```
  `CheckReport` renders `reportText` in a `<pre>` inside `role="region"` labelled `Workflow check`.

- [ ] **Step 1: Write failing tests** (`check.test.ts`):
  - canonical `toYaml` of `sprint-chaser` → `pass: true`, `identical: true`, `warnings: []`; `reportText` starts `Workflow check: PASS` and contains `Round trip: identical`.
  - same text with a stage line `promt: x` inserted → `identical: false`, `pass: false`, `diff[0].yours` contains `promt`; report contains `Round trip: the app would rewrite this file`.
  - a loop whose `blocks` names a missing id → `warnings.length > 0`, `pass: false`.
  - `"blocks: [\n"` (invalid) → `ok: false`; report starts `Workflow check: FAIL` and contains `Couldn't load workflow:`.
  - App test: `initCheckMode` with a valid `&check` hash, render → region `Workflow check` contains `PASS`, no intro dialog, `location.hash` kept.
- [ ] **Step 2: Run** `npx vitest run src/ui/lib/check.test.ts src/ui/App.test.tsx -t check` — Expected: FAIL.
- [ ] **Step 3: Implement** `check.ts`, `CheckReport.tsx`, App wiring.
- [ ] **Step 4: Run** the same, then `npm test` and `npx playwright test e2e/checkMode.e2e.ts` — Expected: PASS.
- [ ] **Step 5: Update `lat.md/`, run `lat check`, commit** `feat: show a workflow check report in check mode`

### Task 5: Skill plugin, generator and drift test

**Files:**
- Create: `.claude-plugin/marketplace.json`, `plugins/promptdraw/.claude-plugin/plugin.json`, `plugins/promptdraw/skills/promptdraw/{SKILL.md,reference.md,example.yaml,link.mjs}`, `scripts/skillReference.ts`, `scripts/skill-ref.ts`, `scripts/skillReference.test.ts`
- Modify: `package.json` (`"skill:ref": "vite-node scripts/skill-ref.ts"`), `scripts/workflow-tool.ts` (`link <file>` command using `makeLinks`)
- Delete: `.claude/skills/promptdraw/`; `.gitignore` back to a single `.claude` line
- Docs: `README.md` (install + use), `lat.md/testing.md` `## Workflow authoring tool` (plugin, generator, drift test)

**Interfaces:**
- Consumes: Task 1 `decodePayload`, `SITE_URL`, `LINK_LIMIT` values (copied as literals into `link.mjs`, which must stay dependency-free).
- Produces:
  - `renderReference(): string` and `renderExample(): string` in `scripts/skillReference.ts` (from `STAGE_MODELS`, `JOINS`, `LOOP_DEFAULTS`, `WORKSPACE`, `TEMPLATES`, `TOGGLE_ORDER`/`TOGGLE_TEXT`, and `toYaml` of starter `sprint-chaser`).
  - `link.mjs`: `export function makeLinks(yaml: string, base?: string): { open: string; check: string; length: number }`; CLI `node link.mjs <file.yaml> [--base <url>]` prints `open: …`, `check: …`, `length: N`, and `note: link is over 8000 characters; hand off the file only` when over the limit.
  - `marketplace.json`: `{ "name": "promptdraw", "owner": { "name": "aswinmurali-io" }, "plugins": [{ "name": "promptdraw", "source": "./plugins/promptdraw", "description": "Write, check and hand off promptdraw workflows" }] }`
  - `plugin.json`: `{ "name": "promptdraw", "version": "0.1.0", "description": "Write, check and hand off promptdraw workflows", "license": "AGPL-3.0-only" }`

`SKILL.md` keeps today's sections (file shape, blocks, functions, parallels, loops, writing well, YAML subset rules, checklist) with every `workflow-tool.ts` command removed, and the loop from the spec: read `reference.md` + `example.yaml` → write → `node link.mjs` → with a browser open the **check** link until `Workflow check: PASS`, screenshot → without one say "unchecked" → hand off the file and the **open** link as a labelled Markdown link (file only when over the limit). Include the Python fallback `zlib.compressobj(9, zlib.DEFLATED, -15)` + `base64.urlsafe_b64encode(...).rstrip(b"=")`.

- [ ] **Step 1: Write failing tests** (`scripts/skillReference.test.ts`): `renderReference()` equals `reference.md` (`?raw` import); `renderExample()` equals `example.yaml`; `fromYaml(example)` has no warnings; `await decodePayload(new URL(makeLinks(example).open).hash.slice(4))` equals `example`; `makeLinks(example).check` ends with `&check`; a non-ASCII YAML round-trips through `makeLinks` → `decodePayload`.
- [ ] **Step 2: Run** `npx vitest run scripts/skillReference.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** generator, CLI, `link.mjs`, plugin JSON, `SKILL.md`; run `npm run skill:ref` to write `reference.md` and `example.yaml`.
- [ ] **Step 4: Run** the test — Expected: PASS. Then from a temp dir outside the repo: `node <repo>/plugins/promptdraw/skills/promptdraw/link.mjs <repo>/plugins/promptdraw/skills/promptdraw/example.yaml` — Expected: three lines, no errors.
- [ ] **Step 5: Remove the old skill, restore `.gitignore`, update README and `lat.md/testing.md`, run `lat check`, `npm test`, `npm run lint`, commit** `feat: ship the promptdraw skill as a Claude Code plugin`

### Task 6: End-to-end hand-off check

**Files:** none new.

- [ ] **Step 1:** `npm run build && npm run preview`; with the built-in browser open `<preview>/#wf=<example payload>&check` — Expected: `Workflow check: PASS`; open the `open` link — Expected: the workflow on Stages, hash cleared.
- [ ] **Step 2:** In a scratch directory outside the repo, follow `SKILL.md` as written to make a small two-stage workflow with a loop; confirm it passes the check against the local preview (`--base`).
- [ ] **Step 3:** `npm test`, `npm run lint`, `npm run typecheck`, `npm run e2e`, `lat check` — all pass. No commit unless a fix was needed (then `fix: …`).
