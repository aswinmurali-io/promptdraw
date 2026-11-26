// Check mode in a real browser: a `#wf=…&check` link opened in a profile with saved work must
// leave every stored key as it was and must not switch another open tab.
// @lat: [[testing#End-to-end tests]]
import { deflateRawSync } from "node:zlib";
import { expect, openApp, test } from "./helpers";

// Canonical (what the app writes back), so the check passes. Core can't load under Playwright.
const YAML = 'name: checked\nversion: 1\ngoal: Check me\nblocks:\n  - id: b1\n    type: stage\n    name: Build\n    prompt: build it\nparallels: []\nloops: []\n';
const payload = deflateRawSync(Buffer.from(YAML, "utf8")).toString("base64url");

const snapshot = () =>
  Object.fromEntries(
    Object.keys(localStorage)
      .filter((k) => k.startsWith("promptdraw:"))
      .sort()
      .map((k) => [k, localStorage.getItem(k)]),
  );

test("a check link never touches saved work or other tabs", async ({ page, context }) => {
  await openApp(page);
  await page.getByLabel("Task", { exact: true }).fill("my saved task");
  await page.waitForTimeout(700);
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByLabel("Task", { exact: true })).toHaveValue("my saved task");
  await other.waitForTimeout(700);
  // The real storage, read from the other tab: the check page only sees its in-memory copy.
  const before = await other.evaluate(snapshot);
  expect(before["promptdraw:task"]).toBe("my saved task");

  await page.goto(`/#wf=${payload}&check`);
  await expect(page.getByText("Check mode: nothing is saved")).toBeVisible();
  await expect(page.getByRole("region", { name: "Workflow check" })).toContainText("Workflow check: PASS");
  await expect(page.getByRole("dialog", { name: /promptdraw in 30 seconds/i })).toHaveCount(0);
  await page.waitForTimeout(700);

  expect(await page.evaluate(() => localStorage.getItem("promptdraw:task"))).not.toBe("my saved task");
  expect(await other.evaluate(snapshot)).toEqual(before);
  await expect(other.getByRole("main", { name: "Task prompt canvas" })).toBeVisible();
  await expect(other.getByLabel("Task", { exact: true })).toHaveValue("my saved task");
});
