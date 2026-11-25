import { describe, expect, it } from "vitest";
import { appDefaults, loadAppConfig, serializeAppConfig, toYaml } from "../../core";
import { sample } from "../../test/fixtures";
import { configJson, importText, workflowYaml } from "./files";

describe("file import / export", () => {
  it("round-trips the Python app's config JSON and keeps the typed task", () => {
    const cfg = { ...appDefaults(), task: "typed", branch: "same" as const, base: "main", progress_minutes: "15" };
    cfg.toggles = { ...cfg.toggles, tests: true, unity_cli: true };
    const text = configJson(cfg);
    expect(text).toBe(serializeAppConfig(cfg));
    const res = importText("prompt_builder.json", text, { ...appDefaults(), task: "kept" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.kind).toBe("config");
    expect(res.cfg).toEqual({ ...loadAppConfig(text), task: "kept" });
    expect(res.cfg.toggles.tests).toBe(true);
    expect(res.cfg.base).toBe("main");
  });

  it("flags a config JSON that would replace the workflow", () => {
    const same = importText("a.json", configJson(appDefaults()), appDefaults());
    expect(same.ok && same.replacesWorkflow).toBe(false);
    const other = importText("b.json", configJson({ ...appDefaults(), workflow: sample().toDict() }), appDefaults());
    expect(other.ok && other.replacesWorkflow).toBe(true);
  });

  it("migrates legacy the Python app keys on import", () => {
    const res = importText("old.json", JSON.stringify({ mcp_check: false, toggles: { unity_mcp: true } }), appDefaults());
    expect(res.ok && res.cfg.cli_check).toBe(false);
    expect(res.ok && res.cfg.toggles.unity_cli).toBe(true);
  });

  it("rejects bad JSON and non-objects", () => {
    expect(importText("x.json", "{nope", appDefaults())).toMatchObject({ ok: false, message: expect.stringMatching(/not valid JSON/) });
    expect(importText("x.json", "[1]", appDefaults())).toMatchObject({ ok: false });
  });

  it("loads a workflow YAML onto the Stages tab", () => {
    const text = toYaml(sample());
    const res = importText("shop.yaml", text, appDefaults());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.kind).toBe("workflow");
    expect(res.cfg.tab).toBe("stages");
    expect(res.cfg.workflow).toEqual(sample().toDict());
    expect(res.warnings).toEqual([]);
    expect(workflowYaml(res.cfg)).toEqual({ name: "shop_screen_polish.yaml", text });
  });

  it("reports YAML errors", () => {
    const res = importText("bad.yml", "blocks:\n  oops\n", appDefaults());
    expect(res).toMatchObject({ ok: false, message: expect.stringMatching(/^Couldn't load workflow bad.yml: line 2/) });
  });
});
