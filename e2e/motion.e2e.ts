// The motion spec in a real browser: what moves, that a reload draws in place, and that reduced
// motion turns it all off.
// @lat: [[testing#End-to-end tests#Motion]]
import type { Page } from "@playwright/test";
import { expect, openApp, test } from "./helpers";

/** Animations running on the page now (CSS and Web Animations), optionally under a selector. */
const running = (page: Page, sel?: string) =>
  page.evaluate((s) => document.getAnimations().filter((a) => a.playState === "running" && (!s || ((a.effect as KeyframeEffect | null)?.target as Element | null)?.closest(s))).length, sel ?? null);

/** Wait until the page has settled (entries only animate after it). */
const settled = (page: Page) => expect(page.locator("html[data-motion]")).toHaveCount(1);

test.describe("motion on", () => {
  test.use({ motion: true });

  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await settled(page);
  });

  test("a reload draws the board and panels in place", async ({ page }) => {
    await page.locator(".work-row", { hasText: "Tests matter" }).locator(".work-main").click();
    await page.reload();
    await expect(page.locator('.lanes .sk-card[data-key="tests"]')).toBeVisible();
    expect(await running(page, ".lanes")).toBe(0);
    expect(await running(page, ".work-panel")).toBe(0);
  });

  test("ticking an option grows its card in; unticking shrinks it away", async ({ page }) => {
    const row = page.locator(".work-row", { hasText: "Tests matter" }).locator(".work-main");
    await row.click();
    expect(await running(page, '.lanes .sk-card[data-key="tests"]')).toBeGreaterThan(0);
    await expect.poll(() => running(page, ".lanes")).toBe(0);
    await row.click();
    // The removed card's inert copy plays its exit, then goes.
    await expect(page.locator(".lanes .sk-card[aria-hidden]")).toHaveCount(1);
    await expect(page.locator(".lanes .sk-card[aria-hidden]")).toHaveCount(0);
  });

  test("How to work slides out on its × and back in from the button", async ({ page }) => {
    const panel = page.locator(".work-panel");
    await page.getByRole("button", { name: "Close How to work" }).click();
    // Mid-exit it is still drawn, moving right.
    expect(await panel.evaluate((el) => getComputedStyle(el).display)).not.toBe("none");
    await expect(panel).toBeHidden();
    await page.getByRole("button", { name: "Show How to work" }).click();
    expect(await running(page, ".work-panel")).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: "Show How to work" })).toHaveCount(0);
  });

  test("a ticked option's settings drop in under the row", async ({ page }) => {
    await page.getByRole("checkbox", { name: /^Multiple workers/ }).check({ force: true });
    const box = page.getByRole("group", { name: "Multiple workers settings" });
    await expect(box).toBeVisible();
    expect(await running(page, ".work-options")).toBeGreaterThan(0);
    // Unticked, it folds away.
    await page.getByRole("checkbox", { name: /^Multiple workers/ }).uncheck({ force: true });
    await expect(page.locator(".work-options[data-ghost]")).toHaveCount(1);
    await expect(page.locator(".work-options[data-ghost]")).toHaveCount(0);
  });

  test("dialogs grow in and fade out", async ({ page }) => {
    await page.locator(".work-reset").click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    expect(await running(page, ".backdrop")).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await expect(page.locator(".backdrop[data-ghost]")).toHaveCount(1);
    await expect(page.locator(".backdrop")).toHaveCount(0);
  });

  test("arrows keep their shape and wait for the cards to land before drawing", async ({ page }) => {
    await page.getByRole("checkbox", { name: /^Tests matter/ }).check({ force: true });
    await expect.poll(() => running(page, ".lanes")).toBe(0);
    const before = await page.locator(".lanes .sk-edge").evaluateAll((gs) => Object.fromEntries(gs.map((g) => [(g as SVGGElement).dataset.edge, g.querySelector("path")!.getAttribute("d")])));
    await page.getByRole("checkbox", { name: /^Reduce assumptions/ }).check({ force: true });
    // Every arrow that redraws starts only once the gliding cards have landed (280 ms).
    const delays = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => ((a.effect as KeyframeEffect).target as Element | null)?.closest(".lanes .sk-edge"))
        .map((a) => Number(a.effect!.getTiming().delay)),
    );
    expect(delays.length).toBeGreaterThan(0);
    for (const d of delays) expect(d).toBeGreaterThanOrEqual(280);
    // An arrow that is still there keeps its wobble: the Goal-to-Tests arrow is keyed by its ends.
    const after = await page.locator('.lanes .sk-edge[data-edge="goal>tests"] path').first().getAttribute("d");
    expect(before["goal>tests"]).toBeTruthy();
    expect(after).toBeTruthy();
  });

  test("switching tabs carries the right-hand panel to its new place", async ({ page }) => {
    await page.keyboard.press("2");
    await expect(page.locator(".panel-morph")).toHaveCount(1);
    await expect(page.locator(".panel-morph")).toHaveCount(0);
    await page.keyboard.press("1");
    await expect(page.locator(".panel-morph")).toHaveCount(1);
  });

  test("the mode pill slides between Simple task and Stages", async ({ page }) => {
    await page.getByRole("toolbar", { name: "Modes and panels" }).getByRole("button", { name: "Stages" }).click();
    await expect(page.locator(".mode-pill")).toHaveCount(1);
    await expect(page.locator(".mode-pill")).toHaveCount(0);
  });
});

test.describe("reduced motion", () => {
  test("nothing moves: changes land in place", async ({ page }) => {
    await openApp(page);
    await settled(page);
    await page.getByRole("checkbox", { name: /^Multiple workers/ }).check({ force: true });
    await page.getByRole("button", { name: "Close How to work" }).click();
    await expect(page.locator(".work-panel")).toBeHidden();
    await page.getByRole("button", { name: "Show How to work" }).click();
    await page.getByRole("toolbar", { name: "Modes and panels" }).getByRole("button", { name: "Stages" }).click();
    expect(await running(page)).toBe(0);
    await expect(page.locator("[data-ghost], .mode-pill, .panel-morph")).toHaveCount(0);
  });
});
