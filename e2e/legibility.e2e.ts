import { openApp, expect, test } from "./helpers";

const weight = (loc: import("@playwright/test").Locator) => loc.evaluate((el) => Number(getComputedStyle(el).fontWeight));

test.describe("type weight", () => {
  test.beforeEach(async ({ page }) => openApp(page));

  test("headings, labels and body text are at least 500", async ({ page }) => {
    await page.keyboard.press("3"); // Settings starts closed on a first visit
    const checks: [string, number][] = [
      ["body", 500],
      [".goal-eyebrow", 700],
      [".intent-label", 600],
      // Panel titles share the Prompt panel's hand-drawn voice; Settings section headings are
      // the inspector's small all-caps ones.
      [".props-panel .props-title", 700],
      [".props-panel .group-label", 600],
      [".props-panel .row-label", 600],
      [".tool-btn .tool-label", 600],
      ["#pd-task", 500],
      [".intent-text", 500],
    ];
    for (const [sel, min] of checks) {
      const loc = page.locator(sel).first();
      await expect(loc, sel).toBeAttached();
      expect(await weight(loc), sel).toBeGreaterThanOrEqual(min);
    }
    const font = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).fontFamily.split(",")[0]);
    expect(await font(".props-panel .props-title")).toBe(await font(".output-title"));
    const head = (sel: string) => page.locator(sel).first().evaluate((el) => { const c = getComputedStyle(el); return [c.textTransform, c.fontSize, c.fontWeight].join(" "); });
    await page.keyboard.press("2");
    await page.keyboard.press("s"); // a new stage opens its inspector
    await expect(page.locator(".insp-section-title").first()).toBeAttached();
    const insp = await head(".insp-section-title");
    await page.keyboard.press("Escape");
    await page.keyboard.press("1");
    expect(await head(".props-panel .group-label")).toBe(insp);
  });

  test("no readable UI text is smaller than 12px", async ({ page }) => {
    await page.keyboard.press("3");
    const tiny = await page.evaluate(() => {
      const out: string[] = [];
      // Key badges and card numbers are held to the floor too.
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(".region *, .props-panel *, .output-panel *, .work-panel *, .lanes *"))) {
        if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())) continue;
        if (el.closest(".visually-hidden")) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size < 12) out.push(`${el.className || el.tagName}: ${size}px`);
      }
      return out;
    });
    expect(tiny).toEqual([]);
  });

  test("a locked option says what it needs; the count is a chip", async ({ page }) => {
    const recon = page.locator(".work-row", { hasText: "Recon via workers" });
    await expect(recon.locator(".intent-lock")).toHaveText(/Needs Multiple workers/);
    // Locked, not faded: its words keep the same ink as an open row's; the box is faded.
    const ink = (row: string) => page.locator(".work-row", { hasText: row }).locator(".intent-label").evaluate((el) => getComputedStyle(el).color);
    expect(await ink("Recon via workers")).toBe(await ink("Superpowers"));
    expect(Number(await recon.locator(".hand-check").evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(1);
    await expect(page.locator(".intentions-count")).toHaveText("none on");
    await page.locator(".work-row", { hasText: "Superpowers" }).locator(".work-main").click();
    await expect(page.locator(".intentions-count")).toHaveText("1 on");
  });

  test("Show all opens an option's exact prompt line in place, without ticking it", async ({ page }) => {
    const row = page.locator(".work-row", { hasText: "Reduce assumptions" });
    const text = row.locator(".intent-text");
    const h0 = (await text.boundingBox())!.height;
    await row.getByRole("button", { name: "Show all" }).click();
    await expect(row.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
    expect((await text.boundingBox())!.height).toBeGreaterThan(h0 + 10);
    await expect(row.getByRole("checkbox")).not.toBeChecked();
    expect((await row.locator(".intent-more").boundingBox())!.width).toBeGreaterThanOrEqual(24);
  });

  test("the panel groups options under small headings, and no summary is cut", async ({ page }) => {
    const groups = page.locator(".work-panel .intent-group");
    await expect(groups.locator(".intent-group-title")).toHaveText(["Before starting", "Agents", "How to build", "Checks", "Report back"]);
    const sizes = [3, 3, 3, 4, 3];
    for (const [i, g] of (await groups.all()).entries()) await expect(g.locator(".work-row")).toHaveCount(sizes[i]!);
    const rows = await page.locator(".work-row").evaluateAll((rs) =>
      rs.map((r) => {
        const t = r.querySelector<HTMLElement>(".intent-text")!;
        return {
          tick: r.querySelector(".hand-check")!.getBoundingClientRect().top,
          title: r.querySelector(".intent-label")!.getBoundingClientRect().top,
          cut: t.scrollHeight > t.clientHeight + 1,
        };
      }),
    );
    for (const r of rows) {
      expect(Math.abs(r.tick - r.title)).toBeLessThanOrEqual(4);
      expect(r.cut).toBe(false);
    }
  });

  test("ticked options run as parallel lanes from the task into the Prompt", async ({ page }) => {
    for (const name of ["Reduce assumptions", "Tests matter"]) await page.locator(".work-row", { hasText: name }).locator(".work-main").click();
    // Drawn by the Stages renderer: stage cards in a parallel frame with its pill, then the Prompt card.
    const card = (k: string) => page.locator(`.lanes .sk-card[data-key="${k}"]`);
    await expect(page.locator(".lanes .sk-card")).toHaveCount(4);
    await expect(page.locator(".lanes .sk-pill text")).toHaveText("⇉ parallel · wait for all");
    const a = (await card("assumptions").boundingBox())!;
    const b = (await card("tests").boundingBox())!;
    const frame = (await page.locator('.lanes .sk-frame[data-key="p_main"]').boundingBox())!;
    const prompt = (await card("prompt_out").boundingBox())!;
    expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(1);
    expect(b.y).toBeGreaterThan(a.y + a.height);
    expect(frame.x).toBeLessThan(a.x);
    expect(frame.x + frame.width).toBeGreaterThan(a.x + a.width);
    // The flow starts at the Goal card, left of the frame; the Prompt card follows the frame.
    const goal = (await card("goal").boundingBox())!;
    expect(goal.x + goal.width).toBeLessThan(frame.x);
    expect(prompt.x >= frame.x + frame.width || prompt.y >= frame.y + frame.height).toBe(true);
    // Cards keep the Stages card's rounded corners.
    expect(await card("tests").locator("path").first().getAttribute("d")).toMatch(/Q/);
  });

  test("the on-cancel lane's Add stage pill uses the UI face", async ({ page }) => {
    await page.keyboard.press("2");
    const pill = page.locator(".sk-addcancel text");
    await expect(pill).toBeAttached();
    expect(await pill.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?Assistant/);
  });

  test("the stage canvas draws card text in bold Kalam", async ({ page }) => {
    await page.keyboard.press("2");
    const text = page.locator(".sk-card text").first();
    await expect(text).toBeAttached();
    expect(await text.evaluate((el) => getComputedStyle(el).fontWeight)).toBe("700");
  });

  test("a short flow opens at 100%, with card eyebrows of at least 12px on screen", async ({ page }) => {
    await page.keyboard.press("2");
    await expect(page.getByRole("button", { name: /^Zoom 100%/ })).toBeVisible();
    const kind = page.locator('.sk-card[data-key="goal"] .sk-kind');
    const h = await kind.evaluate((el) => {
      const size = parseFloat(getComputedStyle(el).fontSize);
      const m = (el as SVGGraphicsElement).getScreenCTM()!;
      return size * m.a;
    });
    expect(h).toBeGreaterThanOrEqual(12);
  });
});

test.describe("labelled toolbar", () => {
  test("every toolbar button shows a word, its key and a described tooltip", async ({ page }) => {
    // Wide enough that How to work (half the window) leaves the toolbar every word and key.
    await page.setViewportSize({ width: 1920, height: 1000 });
    await openApp(page);
    const buttons = page.getByRole("toolbar", { name: "Modes and panels" }).getByRole("button");
    // Copy prompt is always the last, primary button, so hiding the Prompt panel never reflows the bar.
    const labels = await buttons.locator(".tool-label").allInnerTexts();
    expect(labels).toEqual(["Simple task", "Stages", "Settings", "Prompt", "Search", "Copy prompt"]);
    const xs = () => buttons.evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().x)));
    const before = await xs();
    // Prompt takes How to work's place on Simple task: the bar holds still either way.
    await page.keyboard.press("4");
    await expect(page.locator(".output-text")).toBeVisible();
    expect(await xs()).toEqual(before);
    await page.keyboard.press("4");
    await expect(page.locator(".output-text")).toBeHidden();
    expect(await xs()).toEqual(before);
    const copy = buttons.last();
    const bg = await copy.evaluate((b) => getComputedStyle(b).backgroundColor);
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
    for (const label of await buttons.locator(".tool-label").all()) await expect(label).toBeVisible();
    for (let i = 0; i < 4; i++) await expect(buttons.nth(i).locator(".tool-key")).toHaveText(String(i + 1));
    // Search names what it opens and carries its chord like its neighbours carry their keys.
    await expect(buttons.nth(4).locator(".tool-key")).toHaveText(/^(⌘K|Ctrl\+K)$/);
    for (const b of await buttons.all()) expect(await b.getAttribute("data-tooltip")).toMatch(/\n.{10,}/);
    await expect(page.getByRole("button", { name: "Main menu" })).toContainText("Menu");
    await expect(page.getByRole("button", { name: /^Help/ })).toContainText("Help");
  });

  test("the active mode is marked", async ({ page }) => {
    await openApp(page);
    const bar = page.getByRole("toolbar", { name: "Modes and panels" });
    await expect(bar.getByRole("button", { name: "Simple task" })).toHaveAttribute("aria-pressed", "true");
    await bar.getByRole("button", { name: "Stages" }).click();
    await expect(bar.getByRole("button", { name: "Stages" })).toHaveAttribute("aria-pressed", "true");
    await expect(bar.getByRole("button", { name: "Simple task" })).toHaveAttribute("aria-pressed", "false");
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`Copy and the active mode pass WCAG AA contrast (${scheme})`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
      const page = await ctx.newPage();
      await openApp(page);
      const bar = page.getByRole("toolbar", { name: "Modes and panels" });
      for (const btn of [bar.getByRole("button", { name: "Simple task" }), bar.getByRole("button", { name: /^Copy/ })]) {
        const ratio = await btn.evaluate((b) => {
          const rgb = (c: string) => c.match(/[\d.]+/g)!.slice(0, 3).map(Number);
          const lum = ([r, g, b2]: number[]) => {
            const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
            return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b2!);
          };
          const fg = lum(rgb(getComputedStyle(b.querySelector(".tool-label")!).color));
          const bg = lum(rgb(getComputedStyle(b).backgroundColor));
          return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
        });
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      }
      await ctx.close();
    });
  }

  test("the stage bar labels its tools", async ({ page }) => {
    await openApp(page);
    await page.keyboard.press("2");
    const bar = page.getByRole("toolbar", { name: "Workflow" });
    for (const word of ["Stage", "Prompt block", "Function", "More", "Loop", "Parallel"]) {
      await expect(bar.locator(".tool-label", { hasText: new RegExp(`^${word}$`) })).toBeVisible();
    }
    // One way to add each block: no Add ▾ menu beside the direct tools.
    await expect(bar.getByRole("button", { name: "Add block" })).toBeHidden();
    // Name and File live in their own island at the top left; Fit is a word in the zoom island.
    const file = page.getByRole("group", { name: "Workflow name and file" });
    await expect(file.getByRole("button", { name: "Workflow file" })).toContainText("File");
    await expect(page.getByRole("group", { name: "Zoom" }).getByRole("button", { name: "Zoom to fit" })).toContainText("Fit");
    // The tools island sits centred on the mode bar's axis at the foot of the canvas, clear of
    // the workflow island.
    const mode = (await page.getByRole("toolbar", { name: "Modes and panels" }).boundingBox())!;
    const b = (await bar.boundingBox())!;
    const f = (await file.boundingBox())!;
    expect(Math.abs(b.x + b.width / 2 - (mode.x + mode.width / 2))).toBeLessThan(2);
    expect(f.x + f.width).toBeLessThan(b.x);
  });

  for (const width of [1100, 900, 760]) {
    test(`at ${width}px the stage islands keep their words and never overlap`, async ({ browser }) => {
      const page = await browser.newPage({ viewport: { width, height: 760 } });
      await openApp(page);
      await page.keyboard.press("2");
      const bar = page.getByRole("toolbar", { name: "Workflow" });
      await expect(bar.locator(".tool-label", { hasText: /^Parallel$/ })).toBeVisible();
      const b = (await bar.boundingBox())!;
      const f = (await page.getByRole("group", { name: "Workflow name and file" }).boundingBox())!;
      const overlaps = (a: typeof b, c: typeof b) => a.x < c.x + c.width && c.x < a.x + a.width && a.y < c.y + c.height && c.y < a.y + a.height;
      expect(overlaps(b, f)).toBe(false);
      expect(b.x + b.width).toBeLessThanOrEqual(width);
      // Nor does it sit on the zoom row, Help or the main toolbar.
      for (const sel of [".region--bottom-left", ".region--bottom-right", ".region--top-center"]) {
        const o = await page.locator(sel).boundingBox();
        if (o) expect(overlaps(b, o), sel).toBe(false);
      }
      await page.close();
    });
  }

  test("on a phone the labels sit under the icons", async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await openApp(page);
    const buttons = page.getByRole("toolbar", { name: "Modes and panels" }).getByRole("button");
    for (const label of await buttons.locator(".tool-label").all()) await expect(label).toBeVisible();
    const b = (await buttons.first().boundingBox())!;
    const icon = (await buttons.first().locator("svg").boundingBox())!;
    const label = (await buttons.first().locator(".tool-label").boundingBox())!;
    expect(label.y).toBeGreaterThan(icon.y + icon.height - 2);
    expect(b.x + b.width).toBeLessThanOrEqual(390);
    await page.close();
  });
});
