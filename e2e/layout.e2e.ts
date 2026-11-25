// First-run layout, the Stages opening view and inspector, tooltips over open menus, card
// drag feedback and phone sheets: the things a first look at the app is judged by.
// @lat: [[testing#End-to-end tests]]
import type { Page } from "@playwright/test";
import { drag, openApp, expect, test } from "./helpers";

const stageTransform = (page: Page) => page.locator(".stage-svg > g").getAttribute("transform");

/** Box of a selector in viewport pixels. */
const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;

async function settle(page: Page): Promise<void> {
  let last = "";
  await expect
    .poll(async () => {
      const t = (await stageTransform(page)) ?? "";
      const same = t === last;
      last = t;
      return same;
    }, { intervals: [150, 150, 150, 250] })
    .toBe(true);
}

/** The goal card sits whole between the toolbar and the stage bar at the foot. */
async function expectGoalInView(page: Page): Promise<void> {
  const goal = await box(page, '.sk-card[data-key="goal"]');
  const top = await box(page, ".region--top-center");
  const bar = await box(page, ".stage-bar");
  const vp = page.viewportSize()!;
  expect(goal.y).toBeGreaterThan(top.y + top.height);
  expect(goal.y + goal.height).toBeLessThan(bar.y);
  expect(goal.x).toBeGreaterThan(0);
  expect(goal.x + goal.width).toBeLessThan(vp.width);
  expect(goal.y + goal.height).toBeLessThan(vp.height);
}

test.describe("first run", () => {
  test.beforeEach(async ({ page }) => openApp(page));

  test("the welcome's Help hint shows beside Help, left of the full-height How to work panel; the empty task is a quiet note", async ({ page }) => {
    const hint = page.locator(".hint--help");
    await expect(hint).toBeVisible();
    const h = await box(page, ".hint--help");
    const help = (await page.getByRole("button", { name: /^Help/ }).boundingBox())!;
    const work = await box(page, ".work-panel");
    expect(h.x + h.width).toBeLessThanOrEqual(help.x + 2);
    // How to work runs the full height of the right edge; Help and its hint sit left of it.
    expect(work.y).toBe(0);
    expect(h.x + h.width).toBeLessThanOrEqual(work.x);
    await page.keyboard.press("4");
    await expect(page.locator(".output-panel").getByRole("note")).toHaveAttribute("data-tone", "hint");
  });

  test("opens on How to work; the mode is a solid pill and panels are tinted panel buttons", async ({ page }) => {
    await expect(page.getByRole("complementary", { name: "Settings" })).toHaveCount(0);
    // Simple task opens on How to work; the Prompt panel takes its place when asked for.
    await expect(page.locator(".work-panel")).toBeVisible();
    await expect(page.locator(".output-text")).toBeHidden();
    await page.keyboard.press("4");
    await expect(page.locator(".output-text")).toBeVisible();
    await expect(page.locator(".work-panel")).toBeHidden();
    const task = page.getByRole("toolbar", { name: "Modes and panels" }).getByRole("button", { name: "Simple task" });
    const bar = page.getByRole("toolbar", { name: "Modes and panels" });
    const settings = bar.getByRole("button", { name: "Settings panel" });
    const prompt = bar.getByRole("button", { name: "Prompt panel" });
    const bg = (l: typeof task) => l.evaluate((el) => getComputedStyle(el).backgroundColor);
    // The current mode is a solid pill; a shown panel a pale tint with its pane filled in its
    // glyph; a hidden one plain. Three different looks, so no state reads as another.
    expect(await bg(settings)).toBe("rgba(0, 0, 0, 0)");
    const shown = await bg(prompt);
    expect(shown).not.toBe("rgba(0, 0, 0, 0)");
    expect(shown).not.toBe(await bg(task));
    const pane = (l: typeof task) => l.locator(".icon-pane").first().evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(await pane(prompt))).toBeGreaterThan(0);
    expect(await pane(settings)).toBe("0");
    // Two different glyphs: sliders for Settings, a page for Prompt.
    const glyph = (l: typeof task) => l.locator("svg").first().innerHTML();
    expect(await glyph(settings)).not.toBe(await glyph(prompt));
    await expect(settings.locator("svg circle")).not.toHaveCount(0);
    await expect(bar.locator(".tool-switch")).toHaveCount(0);
    // Mode and panel keys are faint digits at rest, a chip on hover.
    const key = settings.locator(".tool-key");
    expect(await key.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    await settings.hover();
    await expect.poll(() => key.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    // The Task field (at the top of How to work) is in view once the Prompt panel gives the edge back.
    await page.keyboard.press("4");
    const t = await box(page, "#pd-task");
    expect(t.y + 40).toBeLessThan(page.viewportSize()!.height);
  });

  test("the Task node is drawn as the Stages Goal card, with a Start here tag until it is filled", async ({ page }) => {
    // The Goal card's shape: its fill path has the card's rounded corners, under the rough outline.
    const fill = page.locator(".goal-node .card-frame path").first();
    await expect(fill).toBeAttached();
    expect(await fill.getAttribute("d")).toMatch(/Q/);
    expect((await box(page, ".goal-node")).width).toBeGreaterThanOrEqual(380);
    const tag = page.locator(".sketch-card--task .start-tag");
    await expect(tag).toHaveText("Start here");
    await page.locator("#pd-task").fill("Fix the login bug");
    await expect(tag).toHaveCount(0);
  });

  test("board content is gone before it reaches the bottom islands; the dot grid runs on", async ({ page }) => {
    const mask = await page.locator(".task-viewport").evaluate((el) => {
      const cs = getComputedStyle(el);
      return cs.maskImage || cs.webkitMaskImage;
    });
    expect(mask).toMatch(/linear-gradient/);
    // The mask's clear stop sits above the zoom island's top edge.
    const vp = await box(page, ".task-viewport");
    const zoom = await box(page, ".region--bottom-left");
    const clearAt = await page.locator(".task-viewport").evaluate((el) => {
      const probe = document.createElement("div");
      probe.style.cssText = "position:absolute;height:var(--foot)";
      el.appendChild(probe);
      const h = probe.getBoundingClientRect().height;
      probe.remove();
      return h;
    });
    expect(vp.y + vp.height - clearAt).toBeLessThanOrEqual(zoom.y);
    expect(await page.locator(".canvas").evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(/radial-gradient/);
  });

  test("the Task sheet is centred in the free canvas; Settings ends clear of the zoom row", async ({ page }) => {
    // Free canvas: from the left edge to the How to work panel on the right.
    const sheet = await box(page, ".canvas-sheet");
    const work = await box(page, ".work-panel");
    const left = sheet.x;
    const right = work.x - (sheet.x + sheet.width);
    expect(right).toBeGreaterThanOrEqual(24);
    expect(Math.abs(left - right)).toBeLessThan(48);
    await page.keyboard.press("3");
    const props = await box(page, ".props-panel");
    const zoom = await box(page, ".region--bottom-left");
    expect(zoom.y - (props.y + props.height)).toBeGreaterThanOrEqual(24);
    // The body scrolls under a fade at its foot rather than ending on a cut line.
    const veil = await page.locator(".settings-body").evaluate((el) => getComputedStyle(el, "::after").backgroundImage);
    expect(veil).toContain("gradient");
  });

  test("a drag inside the empty task field never pans the board", async ({ page }) => {
    const world = page.getByTestId("task-world");
    const before = await world.evaluate((el) => (el as HTMLElement).style.transform);
    const t = await box(page, "#pd-task");
    const [x, y] = [t.x + t.width / 2, t.y + t.height / 2];
    await drag(page, [x, y], [x + 100, y + 50]);
    expect(await world.evaluate((el) => (el as HTMLElement).style.transform)).toBe(before);
  });

  test("a greyed-out stage tool stays focusable and its tooltip says what it needs, over the Prompt panel", async ({ page }) => {
    if (!(await page.locator(".output-panel").count())) await page.keyboard.press("4");
    await page.keyboard.press("2");
    await page.keyboard.press("s");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    const loop = page.getByRole("toolbar", { name: "Workflow" }).getByRole("button", { name: "Loop selected blocks" });
    await expect(loop).toBeDisabled();
    await expect(loop).toHaveAttribute("data-tooltip", /Tick one or more blocks/);
    // Clicking it does nothing; focusing it works, so the reason is in reach by keyboard too.
    await loop.hover();
    await expect.poll(() => loop.evaluate((el) => getComputedStyle(el, "::after").opacity)).toBe("1");
    const z = (sel: string) => page.locator(sel).first().evaluate((el) => Number(getComputedStyle(el).zIndex) || 0);
    expect(await z(".region--stage-bar")).toBeGreaterThan(await z(".output-panel"));
    await loop.click({ force: true });
    await expect(page.locator('[data-hit="loop"]')).toHaveCount(0);
    await loop.focus();
    expect(await loop.evaluate((el) => el === document.activeElement)).toBe(true);
  });

  test("a menu's tooltip hides while the menu is open", async ({ page }) => {
    const menu = page.getByRole("button", { name: "Main menu" });
    await menu.hover();
    await expect.poll(() => menu.evaluate((el) => getComputedStyle(el, "::after").opacity)).toBe("1");
    await menu.click();
    await expect(page.getByRole("menu")).toBeVisible();
    expect(await menu.evaluate((el) => getComputedStyle(el, "::after").opacity)).toBe("0");
  });

  test("tooltips on the bottom islands open above their button, and stay on screen at the edges", async ({ page }) => {
    await page.keyboard.press("2");
    // The tooltip's box, from its button's box and the pseudo-element's computed size and offsets.
    const tip = (sel: string) =>
      page.locator(sel).first().evaluate((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el, "::after");
        const h = parseFloat(cs.height);
        const w = parseFloat(cs.width);
        const top = cs.top === "auto" ? r.bottom - parseFloat(cs.bottom) - h : r.top + parseFloat(cs.top);
        const left = cs.left === "auto" ? r.right - parseFloat(cs.right) - w : r.left + parseFloat(cs.left) - (cs.transform === "none" ? 0 : w / 2);
        return { top, bottom: top + h, left, right: left + w, btnTop: r.top, opacity: cs.opacity };
      });
    const vw = page.viewportSize()!.width;
    const vh = page.viewportSize()!.height;
    for (const sel of ['.stage-bar .tool-btn:has-text("Function")', ".help-trigger", ".zoom-fit"]) {
      await page.locator(sel).first().hover();
      await expect.poll(async () => (await tip(sel)).opacity, { message: sel }).toBe("1");
      const t = await tip(sel);
      expect(t.bottom, sel).toBeLessThanOrEqual(t.btnTop);
      expect(t.top, sel).toBeGreaterThan(0);
      expect(t.bottom, sel).toBeLessThan(vh);
      expect(t.left, sel).toBeGreaterThanOrEqual(0);
      expect(t.right, sel).toBeLessThanOrEqual(vw);
    }
    // A top-row button's tooltip still opens below it.
    const menu = ".menu-trigger, [aria-label='Main menu']";
    await page.locator(menu).first().hover();
    await expect.poll(async () => (await tip(menu)).opacity).toBe("1");
    expect((await tip(menu)).top).toBeGreaterThan((await page.locator(menu).first().boundingBox())!.y);
  });

  test("ticking an intention scrolls the Prompt panel to the new lines and tints them", async ({ page }) => {
    // On Simple task the Prompt panel takes How to work's place, so the option is ticked from
    // the command palette while the Prompt shows.
    await page.keyboard.press("4");
    const box = page.locator(".output-text");
    await expect(box).toBeVisible();
    await expect(page.locator(".md-new")).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.type("Turn on: Tests matter");
    await page.keyboard.press("Enter");
    const fresh = page.locator(".md-new").first();
    await expect(fresh).toBeVisible();
    // In view inside the scrolling box, not left below its fold.
    await expect
      .poll(async () => {
        const b = (await box.boundingBox())!;
        const r = (await fresh.boundingBox())!;
        return r.y >= b.y && r.y + Math.min(r.height, 20) <= b.y + b.height;
      })
      .toBe(true);
    // The tint goes again.
    await expect(page.locator(".md-new")).toHaveCount(0, { timeout: 4000 });
  });

  test("a dialog opening and closing over a pressed button brings back no tooltip", async ({ page }) => {
    const menu = page.getByRole("button", { name: "Main menu" });
    await menu.click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Shift+Slash");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.keyboard.press("2");
    await page.waitForTimeout(500);
    expect(await menu.evaluate((el) => getComputedStyle(el, "::after").opacity)).toBe("0");
  });

  test("Ctrl+K opens the command palette on every platform", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toBeVisible();
    // Every row carries an icon and the labels start on one column, on either tab.
    await page.keyboard.press("Escape");
    await page.keyboard.press("2");
    await page.keyboard.press("Control+k");
    expect(await page.locator(".palette-icon:empty").count()).toBe(0);
    // The Stages tab's own commands lead, and Close inspector waits until something is open.
    await expect(page.getByRole("option").first()).toHaveText(/Add stage/);
    await expect(page.getByRole("option", { name: /Close inspector/ })).toHaveCount(0);
    const lefts = await page.locator(".palette-label").evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().left)))]);
    expect(lefts).toHaveLength(1);
    // The backdrop dims the board enough to set the palette apart.
    const dim = await page.locator(".backdrop").evaluate((el) => Number(getComputedStyle(el).backgroundColor.match(/[\d.]+(?=\))/)![0]));
    expect(dim).toBeGreaterThanOrEqual(0.35);
  });
});

test.describe("stages", () => {
  test.beforeEach(async ({ page }) => openApp(page));

  test("opens on the flow even after an untouched view was remembered", async ({ page }) => {
    // Linger on the Task tab (the old code saved the default view here), then come back.
    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.getByRole("toolbar", { name: "Modes and panels" })).toBeVisible();
    await page.keyboard.press("2");
    await expect(page.getByTestId("stage-surface")).toBeVisible();
    await settle(page);
    expect(await stageTransform(page)).not.toBe("scale(1) translate(0 0)");
    await expectGoalInView(page);
  });

  test("the Prompt panel opens another tab's prompt at its top, footer counts in the UI face", async ({ page }) => {
    // A task long enough that the Simple task prompt scrolls in the (35% wide) panel.
    await page.locator("#pd-task").fill(Array.from({ length: 30 }, (_, i) => `- Step ${i + 1}: check the thing carefully and report what you found.`).join("\n"));
    await page.locator("#pd-task").blur();
    await page.keyboard.press("4");
    const preview = page.getByTestId("prompt-preview");
    await expect(preview).toBeVisible();
    // A workflow long enough that both tabs' prompts scroll.
    await page.keyboard.press("2");
    for (let i = 0; i < 4; i++) await page.keyboard.press("s");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.keyboard.press("1");
    await expect(page.getByTestId("stage-surface")).toHaveCount(0);
    await expect(preview).toBeVisible();
    await preview.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    expect(await preview.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await page.keyboard.press("2");
    await expect(page.getByTestId("stage-surface")).toBeVisible();
    await expect.poll(() => preview.evaluate((el) => el.scrollTop)).toBe(0);
    // The first heading shows whole, under the box's own padding.
    const h = (await preview.locator(".pv-h").first().boundingBox())!;
    const pb = (await preview.boundingBox())!;
    expect(h.y).toBeGreaterThanOrEqual(pb.y + 8);
    const meta = page.locator(".output-meta");
    expect(await meta.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?Assistant/);
    expect(await meta.evaluate((el) => getComputedStyle(el).fontVariantNumeric)).toBe("tabular-nums");
  });

  test("the Prompt panel keeps its place between tabs; the stage tools sit at the foot", async ({ page }) => {
    await page.keyboard.press("4");
    const onTask = await box(page, ".output-panel");
    await page.keyboard.press("2");
    await expect(page.getByTestId("stage-surface")).toBeVisible();
    const onStages = await box(page, ".output-panel");
    expect(onStages.y).toBe(onTask.y);
    const bar = await box(page, ".stage-bar");
    const zoom = await box(page, ".region--bottom-left");
    const vp = page.viewportSize()!;
    expect(bar.y + bar.height).toBeGreaterThan(vp.height - 60);
    expect(bar.x).toBeGreaterThan(zoom.x + zoom.width);
    expect(bar.x + bar.width).toBeLessThan(onStages.x + onStages.width);
    // Its menus open upward, above the bar.
    await page.getByRole("toolbar", { name: "Workflow" }).getByRole("button", { name: "More blocks" }).click();
    const menu = await box(page, '[role="menu"]');
    expect(menu.y + menu.height).toBeLessThanOrEqual(bar.y);
  });

  test("a plain wheel scrolls up and down, Shift+wheel sideways", async ({ page }) => {
    await page.keyboard.press("2");
    await settle(page);
    const t = async () => (await stageTransform(page))!.match(/translate\(([-\d.]+) ([-\d.]+)\)/)!.slice(1).map(Number);
    await page.mouse.move(700, 700);
    const [x0, y0] = await t();
    await page.mouse.wheel(0, 120);
    await expect.poll(async () => (await t())[1]).toBeLessThan(y0);
    expect((await t())[0]).toBe(x0);
    const [x1] = await t();
    await page.keyboard.down("Shift");
    await page.mouse.wheel(0, 120);
    await page.keyboard.up("Shift");
    await expect.poll(async () => (await t())[0]).toBeLessThan(x1);
  });

  test("a selected stage stays clear of the inspector and the status names it", async ({ page }) => {
    await page.keyboard.press("2");
    const bar = page.getByRole("toolbar", { name: "Workflow" });
    for (let i = 0; i < 3; i++) await bar.getByRole("button", { name: "Add stage" }).click();
    // Empty canvas: the first click clears the ticks, the second closes the inspector.
    await page.mouse.click(700, 820);
    await page.mouse.click(700, 820);
    await expect(page.getByRole("complementary", { name: "Stage" })).toHaveCount(0);
    await settle(page);
    const card = page.locator('.sk-card[data-hit="node"]:not([data-key="goal"]):not([data-key="on_cancel"])').first();
    await card.click();
    const insp = page.getByRole("complementary", { name: "Stage" });
    await expect(insp).toBeVisible();
    await settle(page);
    // The inspector docks on the right; the card stays whole to its left.
    const ib = (await insp.boundingBox())!;
    const cb = (await card.boundingBox())!;
    expect(cb.x).toBeGreaterThanOrEqual(0);
    expect(cb.x + cb.width).toBeLessThan(ib.x);
    // Focus is not a tick: Loop stays off until a block is ticked by hand.
    await expect(page.locator('.sk-tick[aria-checked="true"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Loop selected blocks" })).toBeDisabled();
    await card.click({ modifiers: ["Shift"] });
    await expect(page.locator(".stage-hint")).toHaveText(/^1 stage selected · press L to loop/);
    await expect(insp.getByRole("textbox", { name: "Stage name" })).toHaveAttribute("placeholder", /^Name this stage/);
    // The header mirrors the card: "Stage 1" over the name, "Untitled stage" until it has one.
    await expect(insp.locator(".insp-eyebrow")).toHaveText(/^Stage 1$/i);
    await expect(insp.locator(".insp-title")).toHaveText("Untitled stage");
    await insp.getByRole("textbox", { name: "Stage name" }).fill("Reproduce the bug");
    await expect(insp.locator(".insp-title")).toHaveText("Reproduce the bug");
    // Reordering and deleting are apart: Delete sits alone under its own rule.
    await expect(insp.locator(".insp-danger").getByRole("button", { name: "Delete stage" })).toBeVisible();
  });

  test("a card's Group pill and × are 24px targets that say what they do; no grip", async ({ page }) => {
    await page.keyboard.press("2");
    await page.getByRole("toolbar", { name: "Workflow" }).getByRole("button", { name: "Add stage" }).click();
    const card = page.locator(".sk-card[data-focused]");
    await card.hover();
    for (const [sel, tip] of [[".sk-tick", /^Tick to group/], [".sk-del", /^Delete stage$/]] as const) {
      const ctl = card.locator(sel);
      await expect(ctl.locator("title")).toHaveText(tip);
      const bb = (await ctl.boundingBox())!;
      // At the view's zoom (about 100%, eased out at most a little).
      expect(Math.min(bb.width, bb.height)).toBeGreaterThanOrEqual(19);
    }
    // The tick box says what it is for in words; the whole card drags, so there is no grip.
    await expect(card.locator(".sk-tick text")).toHaveText("Group");
    await expect(card.locator(".sk-grip")).toHaveCount(0);
  });

  test("a card's tick, grip and × wait for hover or focus; ticking shows every tick box", async ({ page }) => {
    await page.keyboard.press("2");
    const bar = page.getByRole("toolbar", { name: "Workflow" });
    for (let i = 0; i < 2; i++) await bar.getByRole("button", { name: "Add stage" }).click();
    await page.keyboard.press("Escape");
    await page.mouse.move(700, 820);
    const stages = page.locator('.sk-card[data-hit="node"]:not([data-key="goal"]):not([data-key="on_cancel"])');
    const shown = (card: ReturnType<typeof stages.nth>, sel: string) => card.locator(sel).evaluate((el) => getComputedStyle(el).opacity);
    const [a, b] = [stages.nth(0), stages.nth(1)];
    await expect.poll(() => shown(a, ".sk-tick")).toBe("0");
    expect(await shown(a, ".sk-del")).toBe("0");
    await a.hover();
    await expect.poll(() => shown(a, ".sk-del")).toBe("1");
    expect(await shown(a, ".sk-tick")).toBe("1");
    expect(await shown(b, ".sk-tick")).toBe("0");
    // While anything is ticked, every tick box shows: grouping is under way.
    await a.locator(".sk-tick").click();
    await page.mouse.move(700, 820);
    await expect.poll(() => shown(b, ".sk-tick")).toBe("1");
    expect(await shown(b, ".sk-del")).toBe("0");
  });

  test("a stage added last comes into view with its + clear of the inspector", async ({ page }) => {
    await page.keyboard.press("2");
    const bar = page.getByRole("toolbar", { name: "Workflow" });
    for (let i = 0; i < 3; i++) await bar.getByRole("button", { name: "Add stage" }).click();
    await settle(page);
    // The new stage's inspector holds the right edge, in the Prompt panel's place.
    const out = await box(page, "aside.inspector:not(.inspector--leaving)");
    const card = (await page.locator(".sk-card[data-focused]").boundingBox())!;
    expect(card.x + card.width).toBeLessThan(out.x);
    const pluses = await page.locator(".sk-plus").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, right: r.right })));
    const tail = pluses.filter((p) => p.x > card.x + card.width).sort((a, b) => a.x - b.x)[0]!;
    expect(tail.right).toBeLessThan(out.x);
  });

  test("S S S adds three stages; Enter then edits the focused one's name", async ({ page }) => {
    await page.keyboard.press("2");
    await page.getByTestId("stage-surface").click({ position: { x: 700, y: 820 } });
    for (let i = 0; i < 3; i++) await page.keyboard.press("s");
    const stages = page.locator('.sk-card[data-hit="node"]:not([data-key="goal"]):not([data-key="on_cancel"]):not([data-key^="cancel:"])');
    await expect(stages).toHaveCount(3);
    const name = page.getByRole("complementary", { name: "Stage" }).getByRole("textbox", { name: "Stage name" });
    await expect(name).toHaveValue("");
    await expect(name).not.toBeFocused();
    await page.keyboard.press("Enter");
    await expect(name).toBeFocused();
  });

  test("a stage with no description is flagged, and Fill in opens its description", async ({ page }) => {
    await page.keyboard.press("2");
    await page.getByRole("toolbar", { name: "Workflow" }).getByRole("button", { name: "Add stage" }).click();
    await page.keyboard.press("Escape");
    const note = page.locator(".output-panel").getByRole("note");
    await expect(note).toContainText("Goal and Stage 1's description are empty");
    // The goal comes first; once it is set the stage is what is left.
    await page.locator(".sk-card", { hasText: "GOAL" }).first().click();
    await page.getByRole("complementary").getByRole("textbox").first().fill("Ship it");
    // Leave the field, then close the inspector: the Prompt panel comes back.
    const live = page.locator("aside.inspector:not(.inspector--leaving)");
    for (let i = 0; i < 3 && (await live.count()); i++) await page.keyboard.press("Escape");
    await expect(live).toHaveCount(0);
    await expect(note).toContainText("Stage 1 has no description");
    await note.getByRole("button", { name: "Fill in" }).click();
    const desc = page.locator("aside.inspector:not(.inspector--leaving)").getByRole("textbox", { name: "Prompt description" });
    await expect(desc).toBeFocused();
    await desc.fill("Plan the work");
    await expect(note).toHaveCount(0);
  });

  test("an empty prompt block is flagged and marked in the preview; Fill in opens its text", async ({ page }) => {
    await page.keyboard.press("2");
    await page.locator(".sk-card", { hasText: "GOAL" }).first().click();
    await page.getByRole("complementary").getByRole("textbox").first().fill("Ship it");
    await page.keyboard.press("Escape");
    await page.getByRole("toolbar", { name: "Workflow" }).getByRole("button", { name: "Add prompt block" }).click();
    await page.keyboard.press("Escape");
    const note = page.locator(".output-panel").getByRole("note");
    await expect(note).toContainText("A prompt block is empty");
    await expect(page.locator(".output-panel .md-gap")).toHaveText(/^Note:\s*empty prompt block$/);
    await note.getByRole("button", { name: "Fill in" }).click();
    const text = page.locator("aside.inspector:not(.inspector--leaving)").getByRole("textbox", { name: "Prompt text" });
    await expect(text).toBeFocused();
    await text.fill("Keep it short");
    await expect(note).toHaveCount(0);
    await expect(page.locator(".output-panel .md-gap")).toHaveCount(0);
  });

  test("dragging a card shows its ghost and fades the card", async ({ page }) => {
    await page.keyboard.press("2");
    await page.getByRole("toolbar", { name: "Workflow" }).getByRole("button", { name: "Add stage" }).click();
    await page.mouse.click(700, 820);
    await page.mouse.click(700, 820);
    await settle(page);
    const card = page.locator('.sk-card[data-hit="node"]:not([data-key="goal"]):not([data-key="on_cancel"])').first();
    const b = (await card.boundingBox())!;
    const [x, y] = [b.x + b.width / 2, b.y + b.height * 0.6];
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 160, { steps: 8 });
    await expect(page.locator(".sk-drag")).toBeAttached();
    await expect.poll(() => card.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.5);
    // The ghost keeps the grab offset: it starts where the card starts, not at the pointer.
    const ghost = (await page.locator(".sk-drag > g").last().boundingBox())!;
    expect(Math.abs(ghost.x - b.x)).toBeLessThan(12);
    // A solid card: nothing it passes over shows through it.
    const solid = await page.locator(".sk-ghost > g").first().evaluate((el) => {
      let op = 1;
      for (let e: Element | null = el; e && e.tagName !== "svg"; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
      return op;
    });
    expect(solid).toBe(1);
    // Dragged over the Prompt panel, the ghost stays in the free canvas instead of under it.
    await page.mouse.move(1400, y + 160, { steps: 6 });
    const panel = await box(page, ".output-panel");
    const g2 = (await page.locator(".sk-drag > g").last().boundingBox())!;
    expect(g2.x + g2.width).toBeLessThanOrEqual(panel.x);
    // The line saying what a drop does stays whole in the free canvas too.
    const said = (await page.locator(".sk-drop-label").boundingBox())!;
    expect(said.x + said.width).toBeLessThanOrEqual(panel.x);
    await page.mouse.up();
    await expect(page.locator(".sk-drag")).toHaveCount(0);
  });
});

test.describe("shortcuts dialog", () => {
  for (const tab of ["1", "2"]) {
    test(`fits every group in three balanced columns at 1440x900 (tab ${tab})`, async ({ page }) => {
      await openApp(page);
      await page.keyboard.press(tab); // the Stages tab lists its own, longer, set of keys
      await page.keyboard.press("Shift+Slash");
      const sheet = page.locator(".shortcuts");
      await expect(sheet).toBeVisible();
      const m = await sheet.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight, sw: el.scrollWidth, cw: el.clientWidth }));
      expect(m.sh).toBeLessThanOrEqual(m.ch + 1);
      expect(m.sw).toBeLessThanOrEqual(m.cw + 1);
      await expect(sheet.getByRole("heading", { name: "General" })).toBeInViewport();
      const cols = page.locator(".shortcut-column");
      await expect(cols).toHaveCount(3);
      // The three columns sit side by side and none runs much longer than the others.
      const boxes = await cols.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), h: r.height })));
      expect(new Set(boxes.map((b) => b.top)).size).toBe(1);
      const hs = boxes.map((b) => b.h);
      expect(Math.max(...hs) - Math.min(...hs)).toBeLessThan(220);
    });
  }
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the Goal sheet is as tall as its form, with no empty band above the stage tools", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: /^Stages/ }).click();
    const g = (await page.locator('.sk-card[data-key="goal"]').boundingBox())!;
    await page.mouse.click(g.x + g.width / 2, g.y + 10);
    const insp = page.locator("aside.inspector");
    await expect(insp).toBeVisible();
    const last = (await insp.locator(".insp-body > *").last().boundingBox())!;
    const tools = await box(page, ".region--stage-bar");
    expect(last.y + last.height).toBeLessThanOrEqual(tools.y);
    expect(tools.y - (last.y + last.height)).toBeLessThan(40);
  });

  test("the tab bar holds still as the Prompt sheet opens and closes", async ({ page }) => {
    await openApp(page);
    const bar = page.getByRole("toolbar", { name: "Modes and panels" });
    const xs = () => bar.getByRole("button").evaluateAll((bs) => bs.map((b) => `${b.textContent?.trim()}@${Math.round(b.getBoundingClientRect().x)}`));
    const closed = await xs();
    await bar.getByRole("button", { name: /Prompt/ }).click();
    await expect(page.locator(".output-text")).toBeVisible();
    await expect.poll(xs).toEqual(closed);
    // One Copy: the tab bar's.
    await expect(bar.getByRole("button", { name: /Copy/ })).toBeVisible();
    // Copy is the filled accent pill there too, as on desktop.
    expect(await bar.getByRole("button", { name: /Copy/ }).evaluate((b) => getComputedStyle(b).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    await expect(page.locator(".output-panel").getByRole("button", { name: /Copy/ })).toHaveCount(0);
    // A shown panel is marked like a tab (an accent bar, no fill); only the mode is a filled pill.
    const prompt = bar.getByRole("button", { name: /Prompt/ });
    expect(await prompt.evaluate((b) => getComputedStyle(b).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    expect(await prompt.evaluate((b) => getComputedStyle(b).backgroundImage)).toContain("linear-gradient");
    // The mode segments keep room inside their pill.
    const pad = await bar.getByRole("button", { name: /^Simple task/ }).evaluate((b) => parseFloat(getComputedStyle(b).paddingLeft));
    expect(pad).toBeGreaterThanOrEqual(9);
  });

  test("board content fades out under the menu row instead of running into it", async ({ page }) => {
    await openApp(page);
    const scrim = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector(".app")!, "::after");
      return { content: s.content, h: parseFloat(s.height), z: Number(s.zIndex) };
    });
    expect(scrim.content).not.toBe("none");
    const menu = await box(page, ".menu-trigger");
    expect(scrim.h).toBeGreaterThanOrEqual(menu.y + menu.height);
    expect(scrim.z).toBeLessThan(10);
  });

  test("opens no panel on a first visit; a panel is a sheet down to the screen edge", async ({ page }) => {
    await openApp(page);
    await expect(page.locator(".output-text")).toHaveCount(0);
    await expect(page.getByRole("complementary", { name: "Settings" })).toHaveCount(0);
    await page.getByRole("toolbar", { name: "Modes and panels" }).getByRole("button", { name: "Prompt panel" }).click();
    const sheet = await box(page, ".output-panel");
    expect(sheet.y + sheet.height).toBeGreaterThanOrEqual(843);
    expect(sheet.x).toBeLessThanOrEqual(1);
    // The tab bar stays on top of the sheet's foot, and the meta line sits above the bar.
    const tabs = await box(page, '[role="toolbar"][aria-label="Modes and panels"]');
    const meta = await box(page, ".output-meta");
    expect(meta.y + meta.height).toBeLessThanOrEqual(tabs.y);
  });

  test("the stage bar fits the screen with one Add menu", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: /^Stages/ }).click();
    const bar = page.getByRole("toolbar", { name: "Workflow" });
    const add = bar.getByRole("button", { name: "Add block" });
    await expect(add).toContainText("Add");
    await expect(bar.getByRole("button", { name: "Add stage" })).toBeHidden();
    // Every tool keeps its word under the icon, and nothing is clipped.
    for (const word of ["Add", "Loop", "Parallel"]) await expect(bar.locator(".tool-label", { hasText: new RegExp(`^${word}$`) })).toBeVisible();
    const b = await box(page, ".stage-bar");
    const par = (await bar.getByRole("button", { name: "Run selected in parallel" }).boundingBox())!;
    expect(par.x + par.width).toBeLessThanOrEqual(b.x + b.width);
    expect(b.x + b.width).toBeLessThanOrEqual(390);
    // The workflow's name and File sit beside the menu at the top.
    const file = (await page.getByRole("group", { name: "Workflow name and file" }).boundingBox())!;
    const menu = await box(page, ".menu-trigger");
    expect(file.x).toBeGreaterThan(menu.x + menu.width);
    expect(file.x + file.width).toBeLessThanOrEqual(390);
    await expect(page.getByRole("button", { name: "Workflow file" })).toContainText("File");
  });

  test("an open sheet keeps the stage tools docked above the tab bar and the selected card in view", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: /^Stages/ }).click();
    await page.getByRole("button", { name: "Add block" }).click();
    await page.getByRole("menuitem", { name: /Blank stage/ }).click();
    const sheet = page.getByRole("complementary", { name: "Stage" });
    await expect(sheet).toBeVisible();
    // The stage tools stay one tap away over the sheet's foot: a second stage from here.
    const add = page.getByRole("toolbar", { name: "Workflow" }).getByRole("button", { name: "Add block" });
    await expect(add).toBeVisible();
    await add.click();
    await page.getByRole("menuitem", { name: /Blank stage/ }).click();
    await expect(page.getByRole("complementary", { name: "Stage 2" })).toBeVisible();
    // Scrolled to its foot, the sheet's last buttons sit clear of both docked rows.
    await sheet.locator(".insp-body").evaluate((el) => (el.scrollTop = el.scrollHeight));
    const del = (await sheet.getByRole("button", { name: "Delete" }).boundingBox())!;
    const tools = await box(page, ".region--stage-bar");
    expect(del.y + del.height).toBeLessThanOrEqual(tools.y);
    const tabs = await box(page, '[role="toolbar"][aria-label="Modes and panels"]');
    expect(tools.y + tools.height).toBeLessThanOrEqual(tabs.y + 1);
    // The new card shows above the sheet.
    await expect.poll(async () => {
      const card = (await page.locator('.sk-card[data-hit="node"]:not([data-key="goal"]):not([data-key="on_cancel"])').first().boundingBox())!;
      const s = (await sheet.boundingBox())!;
      return card.y + card.height <= s.y && card.y >= 0;
    }).toBe(true);
  });

  test("the main menu opens over an open sheet, down to its last item", async ({ page }) => {
    await openApp(page);
    await page.getByRole("toolbar", { name: "Modes and panels" }).getByRole("button", { name: "Prompt panel" }).click();
    await expect(page.locator(".output-text")).toBeVisible();
    await page.getByRole("button", { name: "Main menu" }).click();
    const theme = page.getByRole("menuitemradio", { name: /Dark/ });
    await theme.scrollIntoViewIfNeeded();
    const b = (await theme.boundingBox())!;
    // The menu, not the sheet, is what a tap there hits.
    const hit = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest(".menu"), [b.x + b.width / 2, b.y + b.height / 2]);
    expect(hit).toBe(true);
  });

  test("the stage canvas has no zoom or history islands; two rows at the foot, Fit in the stage bar", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: /^Stages/ }).click();
    await expect(page.locator(".zoom-island")).toBeHidden();
    await expect(page.locator(".history-island")).toBeHidden();
    await expect(page.getByRole("toolbar", { name: "Workflow" }).getByRole("button", { name: "Zoom to fit" })).toBeVisible();
    await page.getByRole("button", { name: "Main menu" }).click();
    await expect(page.getByRole("menuitem", { name: /^Undo/ })).toBeVisible();
  });

  test("with the Prompt sheet open the Stages tab shows the flow above the sheet", async ({ page }) => {
    await openApp(page);
    await page.getByRole("toolbar", { name: "Modes and panels" }).getByRole("button", { name: "Prompt panel" }).click();
    await page.getByRole("button", { name: /^Stages/ }).click();
    const sheet = await box(page, ".output-panel");
    await expect.poll(async () => {
      const g = (await page.locator('.sk-card[data-key="goal"]').boundingBox())!;
      return g.y > 56 && g.y + g.height <= sheet.y;
    }).toBe(true);
  });

  test("the Task page has no floating islands over the cards; the menu has undo", async ({ page }) => {
    await openApp(page);
    await expect(page.locator(".history-island")).toBeHidden();
    await expect(page.locator(".help-trigger")).toBeHidden();
    await page.getByRole("button", { name: "Main menu" }).click();
    await expect(page.getByRole("menuitem", { name: /^Undo/ })).toBeVisible();
  });
});

test.describe("touch phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the welcome card drops key chips and keyboard-only actions, and stays short", async ({ page }) => {
    await openApp(page);
    const card = page.getByRole("region", { name: "promptdraw" });
    await expect(card.getByRole("button", { name: "Got it" })).toBeVisible();
    await expect(card.getByRole("button", { name: /Open/ })).toBeVisible();
    await expect(card.getByRole("button", { name: /Command palette/ })).toBeHidden();
    await expect(card.locator("kbd").first()).toBeHidden();
    const b = (await card.boundingBox())!;
    expect(b.height).toBeLessThan(844 * 0.22);
    // The steps keep one line as bare verbs: 1 Describe → 2 Tick → 3 Copy.
    const steps = card.getByRole("list", { name: "How it works" }).getByRole("listitem");
    await expect(steps).toHaveText([/^1\s*Describe$/, /^2\s*Tick$/, /^3\s*Copy$/], { useInnerText: true });
    const ys = await steps.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(ys).size).toBe(1);
  });

  test("the main menu lists no keyboard chords", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: "Got it" }).click();
    await page.getByRole("button", { name: "Main menu" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem").first()).toBeVisible();
    expect(await menu.locator(".menu-shortcut").count()).toBeGreaterThan(0);
    for (const k of await menu.locator(".menu-shortcut").all()) await expect(k).toBeHidden();
  });
});

test.describe("How to work and the Prompt panel", () => {
  test.beforeEach(async ({ page }) => openApp(page));

  test("the close is solid red, the reopen button orange; Fit shows the whole board; the Prompt panel keeps one inset", async ({ page }) => {
    const bg = (sel: string) => page.locator(sel).evaluate((el) => getComputedStyle(el).backgroundColor);
    const danger = await page.evaluate(() => {
      const d = document.createElement("div");
      d.style.color = "var(--danger)";
      document.body.append(d);
      const c = getComputedStyle(d).color;
      d.remove();
      return c;
    });
    expect(await bg(".work-close")).toBe(danger);
    await page.getByRole("button", { name: "Close How to work" }).click();
    await page.mouse.move(200, 600); // off the button: its hover darkens it
    await expect.poll(() => bg(".work-open")).toBe("rgb(240, 140, 0)");
    // Fit zooms out until the whole flow (eight options) shows.
    await page.getByRole("button", { name: "Show How to work" }).click();
    for (const k of ["workers", "recon", "ui", "review", "review_loop", "tests", "progress", "dashboard"]) await page.locator(`#intent-${k}`).check({ force: true });
    await page.getByRole("button", { name: "Zoom to fit" }).click();
    await expect.poll(() => page.locator(".zoom-value").innerText()).not.toBe("100%");
    const board = await box(page, ".lanes-svg");
    const work = await box(page, ".work-panel");
    expect(board.x).toBeGreaterThanOrEqual(0);
    expect(board.x + board.width).toBeLessThanOrEqual(work.x + 1);
    // The Prompt panel: 16px from its edge to the title, the chips and the counts alike.
    await page.keyboard.press("4");
    const panel = await box(page, ".output-panel");
    const title = await box(page, ".output-title");
    const chips = await box(page, ".chips");
    expect(Math.round(title.x - panel.x)).toBe(16);
    expect(Math.round(chips.x - panel.x)).toBe(16);
  });
});
