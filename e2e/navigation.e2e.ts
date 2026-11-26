import { drag, emptyPoint, openApp, expect, test } from "./helpers";

/** Screen extent of the drawn flow: every card plus the gap buttons (+), the trailing one included. */
async function flowBox(page: import("@playwright/test").Page): Promise<{ left: number; right: number; top: number; bottom: number }> {
  return page.locator('.sk-card, .sk-plus').evaluateAll((els) => {
    const rs = els.map((e) => e.getBoundingClientRect());
    return {
      left: Math.min(...rs.map((r) => r.left)),
      right: Math.max(...rs.map((r) => r.right)),
      top: Math.min(...rs.map((r) => r.top)),
      bottom: Math.max(...rs.map((r) => r.bottom)),
    };
  });
}

/** Wait until the opening fit (which re-runs once fonts are measured) has stopped moving the view. */
async function settle(page: import("@playwright/test").Page): Promise<void> {
  let last = "";
  await expect
    .poll(async () => {
      const t = (await page.locator(".stage-svg > g").getAttribute("transform")) ?? "";
      const same = t === last;
      last = t;
      return same;
    }, { intervals: [150, 150, 150, 250] })
    .toBe(true);
}

const taskTransform = (page: import("@playwright/test").Page) => page.getByTestId("task-world").evaluate((el) => (el as HTMLElement).style.transform);
const stageTransform = (page: import("@playwright/test").Page) => page.locator(".stage-svg > g").getAttribute("transform");

test.describe("Task board", () => {
  test.beforeEach(async ({ page }) => openApp(page));

  test("a drag on empty board pans it", async ({ page }) => {
    const before = await taskTransform(page);
    const [x, y] = await emptyPoint(page, ".task-viewport");
    await drag(page, [x, y], [x - 40, y - 120]);
    // The board glides to where the drag left it.
    await expect.poll(() => taskTransform(page)).toContain("translate(-40px, -120px)");
    expect(await taskTransform(page)).not.toBe(before);
  });

  test("a drag that starts on a card pans without toggling it", async ({ page }) => {
    await page.locator(".work-row", { hasText: "Reduce assumptions" }).locator(".work-main").click();
    // A drag that starts on a lane's card pans and swallows its click.
    const card = page.locator('.lanes .sk-card[data-key="assumptions"]');
    const box = (await card.boundingBox())!;
    const tick = page.getByRole("checkbox", { name: /Reduce assumptions/ });
    await drag(page, [box.x + box.width / 2, box.y + box.height / 2], [box.x + box.width / 2, box.y + box.height / 2 - 150]);
    // The board glides to where the drag left it.
    await expect.poll(() => taskTransform(page)).toContain("-150px");
    await expect(tick).toBeChecked();
    // Its × shows on hover and unticks it.
    await card.hover();
    await card.locator('[data-hit="del"]').click();
    await expect(tick).not.toBeChecked();
  });

  test("a drag inside a text field selects text instead of panning", async ({ page }) => {
    const task = page.locator("#pd-task");
    await task.fill("hello world");
    const box = (await task.boundingBox())!;
    await drag(page, [box.x + 8, box.y + 14], [box.x + 120, box.y + 14]);
    expect(await taskTransform(page)).toContain("translate(0px, 0px)");
    expect(await task.evaluate((t: HTMLTextAreaElement) => t.selectionEnd - t.selectionStart)).toBeGreaterThan(0);
  });

  test("Space+drag pans even over a card", async ({ page }) => {
    const box = (await page.locator('.lanes .sk-card[data-key="goal"]').boundingBox())!;
    await page.locator(".task-viewport").focus().catch(() => {});
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.down("Space");
    await drag(page, [box.x + 40, box.y + 40], [box.x + 140, box.y + 40]);
    await page.keyboard.up("Space");
    await expect.poll(() => taskTransform(page)).toContain("translate(100px, 0px)");
  });

  test("middle-button drag pans", async ({ page }) => {
    const [x, y] = await emptyPoint(page, ".task-viewport");
    await page.mouse.move(x, y);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(x + 30, y + 30, { steps: 5 });
    await page.mouse.up({ button: "middle" });
    await expect.poll(() => taskTransform(page)).toContain("translate(30px, 30px)");
  });

  test("wheel pans and Ctrl+wheel zooms toward the pointer", async ({ page }) => {
    const [x, y] = await emptyPoint(page, ".task-viewport");
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, 120);
    await expect.poll(() => taskTransform(page)).toContain("translate(0px, -120px)");
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -40);
    await page.keyboard.up("Control");
    await expect.poll(() => taskTransform(page)).toMatch(/scale\(1\.[1-9]/);
    await expect(page.getByRole("button", { name: /^Zoom 1[1-9]\d%/ })).toBeVisible();
  });

  test("one Ctrl+wheel notch zooms by about 10%, not a jump", async ({ page }) => {
    const [x, y] = await emptyPoint(page, ".task-viewport");
    await page.mouse.move(x, y);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -100);
    await page.keyboard.up("Control");
    await expect(page.getByRole("button", { name: /^Zoom 11[01]%/ })).toBeVisible();
  });

  test("shows a grab cursor on empty board", async ({ page }) => {
    expect(await page.locator(".task-viewport").evaluate((el) => getComputedStyle(el).cursor)).toBe("grab");
  });
});

test.describe("Stages canvas", () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await page.keyboard.press("2");
    await expect(page.getByTestId("stage-surface")).toBeVisible();
    await settle(page);
  });

  test("a drag on empty canvas pans it", async ({ page }) => {
    const before = await stageTransform(page);
    const [x, y] = await emptyPoint(page, ".stage-surface");
    await drag(page, [x, y], [x + 100, y - 50]);
    await settle(page);
    const after = await stageTransform(page);
    expect(after).not.toBe(before);
    const t = (s: string | null) => s!.match(/translate\(([-\d.]+) ([-\d.]+)\)/)!.slice(1).map(Number);
    const [bx, by] = t(before);
    const [ax, ay] = t(after);
    const zoom = Number(after!.match(/scale\(([\d.]+)\)/)![1]);
    expect((ax - bx) * zoom).toBeCloseTo(100, 0);
    expect((ay - by) * zoom).toBeCloseTo(-50, 0);
    expect(await page.getByTestId("stage-surface").evaluate((el) => getComputedStyle(el).cursor)).toBe("grab");
  });

  test("dragging a stage moves the stage, not the board", async ({ page }) => {
    // Room to drop well clear of the free area's edges, where a drag auto-pans.
    await page.keyboard.press("4");
    const bar = page.getByRole("toolbar", { name: "Workflow" });
    await bar.getByRole("button", { name: "Add stage" }).click();
    await bar.getByRole("button", { name: "Add stage" }).click();
    // Close the inspector too: the drag stays in the middle of the free canvas.
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await settle(page);
    const stages = page.locator('.sk-card[data-hit="node"]:not([data-key="goal"]):not([data-key="on_cancel"]):not([data-key^="cancel:"])');
    await expect(stages).toHaveCount(2);
    const keys = await stages.evaluateAll((els) => els.map((e) => e.getAttribute("data-key")));
    const first = page.locator(`.sk-card[data-key="${keys[0]}"]`);
    const second = page.locator(`.sk-card[data-key="${keys[1]}"]`);
    const a = (await first.boundingBox())!;
    const b = (await second.boundingBox())!;
    const before = await stageTransform(page);
    // Drop the first card on the back part of the second one (nearest the gap after it).
    await page.mouse.move(a.x + a.width / 2, a.y + a.height * 0.6);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.8, b.y + b.height / 2, { steps: 10 });
    await expect(page.locator(".sk-drop-label")).toHaveText("Release to move it here");
    await page.mouse.up();
    expect(await stageTransform(page)).toBe(before);
    // The dragged card now comes after the other one in the flow.
    const a2 = (await first.boundingBox())!;
    const b2 = (await second.boundingBox())!;
    expect(a2.x).toBeGreaterThan(b2.x);
    await page.screenshot({ path: "test-results/stage-drag.png" });
  });

  // The drag ghost glides (back onto its card, or to its gap): these run with motion on.
  test.describe("with motion", () => {
    test.use({ motion: true });
    test("a card dragged about one card along snaps to the next gap and reorders", async ({ page }) => {
      const bar = page.getByRole("toolbar", { name: "Workflow" });
      for (let i = 0; i < 3; i++) await bar.getByRole("button", { name: "Add stage" }).click();
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await settle(page);
      const first = page.locator('.sk-card[data-key="b1"]');
      const second = page.locator('.sk-card[data-key="b2"]');
      const a = (await first.boundingBox())!;
      // Grab the body (not the handle), release over the middle of the next card: the nearest
      // gap is the card's own, but it has travelled far enough to mean "after the next one".
      await page.mouse.move(a.x + a.width * 0.4, a.y + a.height * 0.7);
      await page.mouse.down();
      await page.mouse.move(a.x + a.width * 0.4 + 300, a.y + a.height * 0.7 + 20, { steps: 15 });
      await expect(page.locator(".sk-drop-label")).toHaveText("Release to move it here");
      await page.mouse.up();
      await expect.poll(async () => (await first.boundingBox())!.x).toBeGreaterThan((await second.boundingBox())!.x);
    });

    test("empty cards say how to fill them in; the on-cancel lane adds a stage from the card", async ({ page }) => {
      await expect(page.locator('.sk-card[data-key="goal"]')).toContainText("Describe the goal");
      const add = page.locator('.sk-card[data-key="on_cancel"] .sk-addcancel');
      await expect(add).toContainText("+ Add stage");
      const r = (await add.boundingBox())!;
      await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
      await expect(page.locator('.sk-card[data-key="cancel:0"]')).toHaveCount(1);
      await expect(page.getByRole("complementary", { name: /Cancel stage 1/ })).toBeVisible();
      await expect(add).toHaveCount(0);
    });

    test("an empty workflow points at the Stage tool until a stage exists", async ({ page }) => {
      const hint = page.getByTestId("stage-empty-hint");
      await expect(hint).toContainText("Add your first stage");
      const tool = (await page.getByRole("toolbar", { name: "Workflow" }).getByRole("button", { name: "Add stage" }).boundingBox())!;
      const h = (await hint.boundingBox())!;
      // The Stage tool sits at the foot of the canvas: the note sits above it, pointing down.
      expect(h.y + h.height).toBeLessThanOrEqual(tool.y);
      expect(Math.abs(h.x - (tool.x + tool.width / 2))).toBeLessThan(8);
      // Its arrow ends right on the tool, not in the empty space above it.
      const arrow = (await hint.locator("svg").boundingBox())!;
      expect(tool.y - (arrow.y + arrow.height)).toBeLessThan(16);
      // It takes the status line's place rather than writing over it.
      await expect(page.locator(".stage-hint")).toHaveCSS("opacity", "0");
      await page.keyboard.press("s");
      await expect(hint).toHaveCount(0);
      // With the first stage the how-to line shows; from the second on it steps aside...
      const status = page.locator(".stage-hint");
      await expect(status).toHaveText(/^Click a block to edit it/);
      await expect(status).toHaveCSS("opacity", "1");
      await page.keyboard.press("s");
      await expect(status).toHaveCSS("opacity", "0");
      // ...while a status that says something, such as what is ticked, still shows.
      await page.locator('.sk-card[data-key="b1"]').click({ modifiers: ["Shift"] });
      await expect(status).toHaveText(/^1 stage selected/);
      await expect(status).toHaveCSS("opacity", "1");
    });

    test("a drop that changes nothing leaves the board where it was", async ({ page }) => {
      const bar = page.getByRole("toolbar", { name: "Workflow" });
      for (let i = 0; i < 3; i++) await bar.getByRole("button", { name: "Add stage" }).click();
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("complementary", { name: "Stage" })).toHaveCount(0);
      await settle(page);
      const card = page.locator('.sk-card[data-hit="node"]:not([data-key="goal"]):not([data-key="on_cancel"]):not([data-key^="cancel:"])').first();
      const b = (await card.boundingBox())!;
      const before = await stageTransform(page);
      // Down and back: a real drag that drops nowhere new.
      await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.6);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height * 0.6 + 140, { steps: 8 });
      // Every gap is marked while dragging, and the ghost says a drop here changes nothing.
      await expect(page.locator(".sk-drop-gap")).toHaveCount(await page.locator('.sk-card[data-hit="node"]').count() - 2 + 1);
      await expect(page.locator(".sk-drop-label")).toHaveText("Drop on a gap to reorder");
      await page.mouse.up();
      // The ghost glides back onto the card, then goes.
      await expect(page.locator(".sk-ghost[data-returning]")).toBeAttached();
      await expect(page.locator(".sk-drag")).toHaveCount(0);
      await expect.poll(() => stageTransform(page)).toBe(before);
      await expect(page.getByRole("complementary", { name: "Stage" })).toHaveCount(0);
    });
  });

  test("opening the inspector keeps the cards that showed in the free canvas", async ({ page }) => {
    const goal = page.locator('.sk-card[data-key="goal"]');
    await page.locator('.sk-card[data-key="on_cancel"]').click();
    const insp = page.getByRole("complementary", { name: "On cancel" });
    await expect(insp).toBeVisible();
    await settle(page);
    // The inspector docks on the right, in the Prompt panel's place.
    const ib = (await insp.boundingBox())!;
    const g = (await goal.boundingBox())!;
    expect(g.x).toBeGreaterThanOrEqual(0);
    expect(g.x + g.width).toBeLessThan(ib.x);
  });

  test("adding stages keeps card type readable, and closing the inspector brings the Goal back", async ({ page }) => {
    const bar = page.getByRole("toolbar", { name: "Workflow" });
    await bar.getByRole("button", { name: "Add stage" }).click();
    await bar.getByRole("button", { name: "Add stage" }).click();
    const insp = page.getByRole("complementary", { name: /Stage/ });
    await expect(insp).toBeVisible();
    await settle(page);
    const zoomOf = async () => Number((await stageTransform(page))!.match(/scale\(([\d.]+)\)/)![1]);
    // Card type stays readable while editing: an automatic move eases out a little at most.
    expect(await zoomOf()).toBeGreaterThanOrEqual(0.8);
    // The block being edited sits whole in the free canvas.
    const ib = (await insp.boundingBox())!;
    const focused = (await page.locator('.sk-card[data-focused]').boundingBox())!;
    expect(focused.x).toBeGreaterThanOrEqual(0);
    expect(focused.x + focused.width).toBeLessThan(ib.x);
    // A third stage, then close: the zoom holds and the Goal is back in view.
    await page.keyboard.press("Escape");
    await page.keyboard.press("s");
    await settle(page);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("complementary", { name: /Stage/ })).toHaveCount(0);
    await settle(page);
    expect(await zoomOf()).toBeGreaterThanOrEqual(0.8);
    const out = (await page.locator(".output-panel").boundingBox())!;
    const g = (await page.locator('.sk-card[data-key="goal"]').boundingBox())!;
    expect(g.x).toBeGreaterThanOrEqual(0);
    expect(g.x + g.width).toBeLessThan(out.x);
  });

  test("adding stages keeps a flow that fits centred between the panels, with room all round", async ({ page }) => {
    await page.keyboard.press("4"); // Prompt off: the inspector on the right, the rest free
    await expect(page.locator(".output-panel")).toHaveCount(0);
    const bar = page.getByRole("toolbar", { name: "Workflow" });
    await bar.getByRole("button", { name: "Add stage" }).click();
    await bar.getByRole("button", { name: "Add stage" }).click();
    const insp = page.getByRole("complementary", { name: /Stage/ });
    await expect(insp).toBeVisible();
    await settle(page);
    const ib = (await insp.boundingBox())!;
    const flow = await flowBox(page);
    const leftRoom = flow.left;
    const rightRoom = ib.x - flow.right;
    // Not pushed against the right edge, the trailing + included.
    expect(leftRoom).toBeGreaterThanOrEqual(40);
    expect(rightRoom).toBeGreaterThanOrEqual(40);
    expect(Math.abs(leftRoom - rightRoom)).toBeLessThan(24);
    // Inspector closed, Prompt back on: centred in what is left of the canvas, easing out a
    // little rather than letting the Goal hug the left edge.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("complementary", { name: /Stage/ })).toHaveCount(0);
    await page.keyboard.press("4");
    await expect(page.locator(".output-panel")).toBeVisible();
    await settle(page);
    const out = (await page.locator(".output-panel").boundingBox())!;
    const f2 = await flowBox(page);
    expect(f2.left).toBeGreaterThanOrEqual(40);
    expect(out.x - f2.right).toBeGreaterThanOrEqual(40);
    expect(Math.abs(f2.left - (out.x - f2.right))).toBeLessThan(24);
  });

  test("closing the inspector re-centres a flow that fits in the free canvas", async ({ page }) => {
    await page.keyboard.press("4"); // Prompt panel off: the whole width is free
    await expect(page.locator(".output-panel")).toHaveCount(0);
    const bar = page.getByRole("toolbar", { name: "Workflow" });
    await bar.getByRole("button", { name: "Add stage" }).click();
    await bar.getByRole("button", { name: "Add stage" }).click();
    await settle(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("complementary", { name: /Stage/ })).toHaveCount(0);
    await settle(page);
    const flow = await page.locator('.sk-card[data-hit="node"]').evaluateAll((els) => {
      const rs = els.map((e) => e.getBoundingClientRect());
      return { left: Math.min(...rs.map((r) => r.left)), right: Math.max(...rs.map((r) => r.right)) };
    });
    const vw = page.viewportSize()!.width;
    // Equal room either side (within the trailing +), not packed against one edge.
    expect(Math.abs(flow.left - (vw - flow.right))).toBeLessThan(80);
  });

  test("wheel pans and Ctrl+wheel zooms", async ({ page }) => {
    const [x, y] = await emptyPoint(page, ".stage-surface");
    const before = await stageTransform(page);
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, 120);
    await expect.poll(() => stageTransform(page)).not.toBe(before);
    const panned = await stageTransform(page);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -40);
    await page.keyboard.up("Control");
    await expect.poll(() => stageTransform(page)).not.toBe(panned);
  });

  test("Fit never shrinks cards past readable; it refits when a panel opens or closes", async ({ page }) => {
    const zoomOf = async () => Number((await stageTransform(page))!.match(/scale\(([\d.]+)\)/)![1]);
    if (!(await page.locator(".output-panel").count())) await page.keyboard.press("4");
    await expect(page.locator(".output-panel")).toBeVisible();
    for (let i = 0; i < 7; i++) await page.keyboard.press("s");
    await settle(page);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.locator(".zoom-fit").click();
    await settle(page);
    // Seven stages don't fit beside the Prompt panel at a readable size: Fit stops at 80% and
    // starts at the Goal, rather than a strip of 6px type, and a chip says what is left.
    expect(await zoomOf()).toBeGreaterThanOrEqual(0.8);
    await expect(page.getByTestId("flow-more-right")).toHaveText(/^\d+ more stages?/);
    const out = (await page.locator(".output-panel").boundingBox())!;
    const g = (await page.locator('.sk-card[data-key="goal"]').boundingBox())!;
    expect(g.x).toBeGreaterThan(0);
    expect(g.x + g.width).toBeLessThan(out.x);
    // Selecting a card opens the inspector: the fitted view refits around it, easing out no
    // further than 70%, with the focused card and both neighbours whole between the panels.
    await page.locator('.sk-card[data-key="b3"]').click();
    const insp = page.getByRole("complementary", { name: /Stage/ });
    await expect(insp).toBeVisible();
    await settle(page);
    expect(await zoomOf()).toBeGreaterThanOrEqual(0.7);
    const ib = (await insp.boundingBox())!;
    for (const key of ["b2", "b3", "b4"]) {
      const n = (await page.locator(`.sk-card[data-key="${key}"]`).boundingBox())!;
      expect(n.x, key).toBeGreaterThanOrEqual(0);
      expect(n.x + n.width, key).toBeLessThan(ib.x);
    }
  });

  test("selecting a stage between two open panels shows it with both neighbours whole", async ({ page }) => {
    const zoomOf = async () => Number((await stageTransform(page))!.match(/scale\(([\d.]+)\)/)![1]);
    if (!(await page.locator(".output-panel").count())) await page.keyboard.press("4");
    await expect(page.locator(".output-panel")).toBeVisible();
    for (let i = 0; i < 3; i++) await page.keyboard.press("s");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("complementary", { name: /Stage/ })).toHaveCount(0);
    await settle(page);
    // Not a Fit: the view the flow was left at, then a click on the first stage.
    await page.locator('.sk-card[data-key="b1"]').click();
    const insp = page.getByRole("complementary", { name: /Stage/ });
    await expect(insp).toBeVisible();
    await settle(page);
    expect(await zoomOf()).toBeGreaterThanOrEqual(0.7);
    const ib = (await insp.boundingBox())!;
    for (const key of ["goal", "b1", "b2"]) {
      const n = (await page.locator(`.sk-card[data-key="${key}"]`).boundingBox())!;
      expect(n.x, key).toBeGreaterThanOrEqual(0);
      expect(n.x + n.width, key).toBeLessThan(ib.x);
    }
  });

  test("Fit shows four stages whole without panels; with the Prompt panel a chip pages to the rest", async ({ page }) => {
    if (!(await page.locator(".output-panel").count())) await page.keyboard.press("4");
    await expect(page.locator(".output-panel")).toBeVisible();
    for (let i = 0; i < 4; i++) await page.keyboard.press("s");
    await settle(page);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.locator(".zoom-fit").click();
    await settle(page);
    const withPanel = await stageTransform(page);
    // Under the panel: the cards it hides are counted on a chip at its edge.
    const chip = page.getByTestId("flow-more-right");
    await expect(chip).toBeVisible();
    const out = (await page.locator(".output-panel").boundingBox())!;
    const cb = (await chip.boundingBox())!;
    expect(cb.x + cb.width).toBeLessThanOrEqual(out.x);
    // The chip pages the board until the last stage is clear of the panel; then a chip leads back.
    for (let i = 0; i < 3 && (await chip.count()); i++) {
      await chip.click();
      await settle(page);
    }
    await expect(chip).toHaveCount(0);
    const last = (await page.locator('.sk-card[data-key="b4"]').boundingBox())!;
    expect(last.x + last.width).toBeLessThan(out.x);
    await expect(page.getByTestId("flow-more-left")).toBeVisible();
    // Without the panel Fit really fits: every card on screen, and a different camera.
    await page.keyboard.press("4");
    await expect(page.locator(".output-panel")).toHaveCount(0);
    await page.locator(".zoom-fit").click();
    await settle(page);
    expect(await stageTransform(page)).not.toBe(withPanel);
    const flow = await flowBox(page);
    expect(flow.left).toBeGreaterThanOrEqual(0);
    expect(flow.right).toBeLessThanOrEqual(page.viewportSize()!.width);
    await expect(page.getByTestId("flow-more-right")).toHaveCount(0);
    await expect(page.getByTestId("flow-more-left")).toHaveCount(0);
  });

  test("adding a block re-shows a panned flow whole when it fits at a readable zoom", async ({ page }) => {
    if (await page.locator(".output-panel").count()) await page.keyboard.press("4");
    await expect(page.locator(".output-panel")).toHaveCount(0);
    // Small enough to fit whole beside the (40% wide) inspector once the third block is added.
    await page.keyboard.press("s");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await settle(page);
    // Pan the Goal off the left edge.
    const [x, y] = await emptyPoint(page, ".stage-surface");
    await drag(page, [x, y], [x - 600, y]);
    await settle(page);
    expect((await page.locator('.sk-card[data-key="goal"]').boundingBox())!.x).toBeLessThan(0);
    await page.keyboard.press("s");
    const insp = page.getByRole("complementary", { name: /Stage/ });
    await expect(insp).toBeVisible();
    await settle(page);
    const ib = (await insp.boundingBox())!;
    const g = (await page.locator('.sk-card[data-key="goal"]').boundingBox())!;
    const last = (await page.locator('.sk-card[data-key="b2"]').boundingBox())!;
    expect(g.x).toBeGreaterThanOrEqual(0);
    expect(last.x + last.width).toBeLessThan(ib.x);
    expect(Number((await stageTransform(page))!.match(/scale\(([\d.]+)\)/)![1])).toBeGreaterThanOrEqual(0.8);
    await expect(page.getByTestId("flow-more-left")).toHaveCount(0);
  });

  test("a fitted flow re-centres when the Prompt panel closes", async ({ page }) => {
    if (!(await page.locator(".output-panel").count())) await page.keyboard.press("4");
    await expect(page.locator(".output-panel")).toBeVisible();
    for (let i = 0; i < 4; i++) await page.keyboard.press("s");
    await settle(page);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.locator(".zoom-fit").click();
    await settle(page);
    const fittedZoom = Number((await stageTransform(page))!.match(/scale\(([\d.]+)\)/)![1]);
    await page.keyboard.press("4");
    await expect(page.locator(".output-panel")).toHaveCount(0);
    await settle(page);
    const flow = await flowBox(page);
    const vw = page.viewportSize()!.width;
    // The whole width is used again: centred, not left in the old free area's left part.
    expect(Math.abs(flow.left - (vw - flow.right))).toBeLessThan(80);
    expect(Number((await stageTransform(page))!.match(/scale\(([\d.]+)\)/)![1])).toBeGreaterThanOrEqual(fittedZoom);
  });

});
