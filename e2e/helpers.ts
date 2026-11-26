import { expect, test as base, type Page } from "@playwright/test";

/**
 * The suite's `test`: every page starts with reduced motion, so boxes are measured where they
 * settle (the context's reducedMotion option does not reach this Chromium; emulateMedia does).
 * motion.e2e.ts turns motion back on.
 */
export const test = base.extend<{ motion: boolean }>({
  /** Leave motion on (a test of a glide or a ghost that moves). */
  motion: [false, { option: true }],
  page: async ({ page, motion }, provide) => {
    if (!motion) await page.emulateMedia({ reducedMotion: "reduce" });
    await provide(page);
  },
});
export { expect };

/**
 * Fresh app: no stored state, fonts loaded. `stagesPrompt` starts as a returning user who left
 * the Prompt panel shown on Stages (a first visit opens Stages without it).
 */
export async function openApp(page: Page, { stagesPrompt = false }: { stagesPrompt?: boolean } = {}): Promise<void> {
  await page.addInitScript((prompt) => {
    if (sessionStorage.getItem("e2e-init")) return;
    sessionStorage.setItem("e2e-init", "1");
    localStorage.clear();
    // Suites test the app itself, not the first-visit intro video.
    localStorage.setItem("promptdraw:intro", "seen");
    if (prompt) localStorage.setItem("promptdraw:prefs", JSON.stringify({ showPrompt: true }));
  }, stagesPrompt);
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("toolbar", { name: "Modes and panels" })).toBeVisible();
}

export async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 10 });
  await page.mouse.up();
}

/** A screen point on the board that hits nothing but the board itself. */
export async function emptyPoint(page: Page, surface: string): Promise<[number, number]> {
  const pt = await page.evaluate((sel) => {
    const root = document.querySelector(sel)!;
    const r = root.getBoundingClientRect();
    for (let y = r.top + 120; y < r.bottom - 120; y += 17) {
      for (let x = r.left + 300; x < r.right - 300; x += 23) {
        const el = document.elementFromPoint(x, y);
        if (!el || !root.contains(el)) continue;
        if (el.closest("[data-hit], textarea, input, button, label, .sketch-card, .welcome, section")) continue;
        return [x, y] as [number, number];
      }
    }
    return null;
  }, surface);
  expect(pt, `no empty spot on ${surface}`).not.toBeNull();
  return pt!;
}
