// A/B prompt flags in a real browser: the fork's frame holds its lanes, each lane's tag sits
// above its card, the chosen side is solid and the other dimmed, and the Flags popover opens
// clear of the stage bar on a wide screen and on a phone.
// @lat: [[testing#End-to-end tests]]
import type { Page } from "@playwright/test";
import { expect, openApp, test } from "./helpers";

const stage = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, type: "stage", name, prompt: name + " body", ...extra });
const WORKFLOW = {
  name: "ab",
  goal: "Ship it",
  flags: [{ name: "play_bot", type: "bool", default: false, label: "Use Play Bot" }],
  blocks: [stage("b1", "Before", { prompt: "Before {{#if play_bot}}new{{#else}}old{{/if}}" }), stage("b2", "New way", { when: "play_bot" }), stage("b3", "Old way", { when: "!play_bot" }), stage("b4", "After")],
  parallels: [],
  loops: [],
};

async function open(page: Page): Promise<void> {
  await openApp(page);
  await page.evaluate((wf) => localStorage.setItem("promptdraw:config", JSON.stringify({ workflow: wf, tab: "stages" })), WORKFLOW);
  await page.evaluate(() => localStorage.setItem("promptdraw:prefs", JSON.stringify({ showProps: false, showPrompt: true, zoom: 100, welcomeDismissed: true })));
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".sk-fork")).toBeAttached();
}

const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;

test("the fork frame holds both lanes and each tag sits above its card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const frame = await box(page, ".sk-fork path");
  for (const key of ["b2", "b3"]) {
    const c = await box(page, `.sk-card[data-key="${key}"] path`);
    expect(c.x).toBeGreaterThan(frame.x);
    expect(c.x + c.width).toBeLessThan(frame.x + frame.width);
    expect(c.y).toBeGreaterThan(frame.y);
    expect(c.y + c.height).toBeLessThan(frame.y + frame.height);
  }
  const tags = page.locator(".sk-fork-tags .sk-variant");
  await expect(tags).toHaveCount(2);
  const [t0, t1] = [await tags.nth(0).locator(".sk-tag-bg").boundingBox(), await tags.nth(1).locator(".sk-tag-bg").boundingBox()];
  const [c0, c1] = [await box(page, '.sk-card[data-key="b2"] path'), await box(page, '.sk-card[data-key="b3"] path')];
  expect(t0!.y + t0!.height).toBeLessThanOrEqual(c0.y + 1);
  expect(t1!.y + t1!.height).toBeLessThanOrEqual(c1.y + 1);
  expect(c1.y).toBeGreaterThan(c0.y + c0.height);
});

test("the chosen side is solid and the other dimmed, and the Flags popover flips them", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const opacity = (key: string) => page.locator(`.sk-card[data-key="${key}"]`).evaluate((el) => Number(getComputedStyle(el).opacity));
  expect(await opacity("b3")).toBe(1);
  expect(await opacity("b2")).toBeLessThan(0.7);
  await page.getByRole("button", { name: "Prompt flags", exact: true }).click();
  const pop = page.getByRole("dialog", { name: "Prompt flags" });
  await expect(pop).toBeVisible();
  const [pb, bar] = [await pop.boundingBox(), await page.getByRole("toolbar", { name: "Workflow" }).boundingBox()];
  expect(pb!.y + pb!.height).toBeLessThanOrEqual(bar!.y);
  expect(pb!.x).toBeGreaterThanOrEqual(0);
  expect(pb!.x + pb!.width).toBeLessThanOrEqual(1440);
  await pop.getByRole("checkbox", { name: /play_bot/ }).check();
  expect(await opacity("b2")).toBe(1);
  expect(await opacity("b3")).toBeLessThan(0.7);
});

test("on a phone the popover stays on screen above the stage bar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.getByRole("button", { name: "Prompt flags", exact: true }).click();
  const pop = page.getByRole("dialog", { name: "Prompt flags" });
  await expect(pop).toBeVisible();
  const [pb, bar] = [await pop.boundingBox(), await page.getByRole("toolbar", { name: "Workflow" }).boundingBox()];
  expect(pb!.x).toBeGreaterThanOrEqual(0);
  expect(pb!.x + pb!.width).toBeLessThanOrEqual(390);
  expect(pb!.y + pb!.height).toBeLessThanOrEqual(bar!.y + 1);
  expect(pb!.y).toBeGreaterThanOrEqual(0);
});

test("pressing the unchosen lane's tag switches the variant, and the Prompt panel follows", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const opacity = (key: string) => page.locator(`.sk-card[data-key="${key}"]`).evaluate((el) => Number(getComputedStyle(el).opacity));
  const tag = page.locator('[data-tag="lane"][data-key="b2"]');
  expect(await tag.evaluate((el) => getComputedStyle(el).cursor)).toBe("pointer");
  await expect(tag.locator("title")).toHaveText("Click to switch to variant A");
  await tag.hover();
  await tag.click();
  expect(await opacity("b2")).toBe(1);
  expect(await opacity("b3")).toBeLessThan(0.7);
  await expect(page.locator(".output-panel")).toContainText("New way [Variant A (play_bot): use]");
  await expect(tag.locator("title")).toHaveText("Variant A is chosen");
  // the lane's own room switches too
  await page.locator('.sk-lane[data-key="b3"]').click({ position: { x: 4, y: 40 } });
  expect(await opacity("b3")).toBe(1);
  await expect(page.locator(".output-panel")).toContainText("Old way [Variant B (!play_bot): use]");
});

test("a tag takes the keyboard: Tab to it, Enter or Space presses it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const tag = page.locator('[data-tag="lane"][data-key="b2"]');
  await tag.focus();
  await expect(tag).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".output-panel")).toContainText("New way [Variant A (play_bot): use]");
  await page.locator('[data-tag="lane"][data-key="b3"]').focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".output-panel")).toContainText("Old way [Variant B (!play_bot): use]");
});

test("the fork's pill opens the flags beside the press with the flag focused", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const pill = page.locator('[data-tag="fork"]');
  const at = (await pill.boundingBox())!;
  await pill.click();
  const pop = page.getByRole("dialog", { name: "Prompt flags" });
  await expect(pop).toBeVisible();
  await expect(pop.getByRole("checkbox", { name: /play_bot/ })).toBeFocused();
  const pb = (await pop.boundingBox())!;
  expect(pb.x).toBeGreaterThanOrEqual(0);
  expect(pb.x + pb.width).toBeLessThanOrEqual(1440);
  expect(pb.y).toBeGreaterThanOrEqual(0);
  expect(pb.y + pb.height).toBeLessThanOrEqual(900);
  expect(Math.abs(pb.x + pb.width / 2 - (at.x + at.width / 2))).toBeLessThan(260);
  expect(Math.abs(pb.y - (at.y + at.height)) < 80 || Math.abs(at.y - (pb.y + pb.height)) < 80).toBe(true);
});

test("a card's inline A/B tag names the flag, the branches and the one followed, and opens the flags", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const tag = page.locator('[data-tag="inline"]');
  await expect(tag.locator("text")).toHaveText("A/B · play_bot · 2 branches → B");
  await tag.click();
  const pop = page.getByRole("dialog", { name: "Prompt flags" });
  await expect(pop.getByRole("checkbox", { name: /play_bot/ })).toBeFocused();
  await pop.getByRole("checkbox", { name: /play_bot/ }).check();
  await expect(tag.locator("text")).toHaveText("A/B · play_bot · 2 branches → A");
  // still reachable from the stage bar
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Prompt flags", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Prompt flags" })).toBeVisible();
});
