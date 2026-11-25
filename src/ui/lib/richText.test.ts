import { describe, expect, it } from "vitest";
import { deleteCall, richParts } from "./richText";

describe("rich stage text", () => {
  it("splits calls, fill-ins and bold into parts that join back to the text", () => {
    const text = "Run [[Critique: take = all]] on {{SCREEN}} then **ship** it";
    const parts = richParts(text);
    expect(parts.map((p) => p.text).join("")).toBe(text);
    expect(parts.filter((p) => p.kind !== "plain")).toEqual([
      { kind: "call", text: "[[Critique: take = all]]" },
      { kind: "fill", text: "{{SCREEN}}" },
      { kind: "stars", text: "**" },
      { kind: "bold", text: "ship" },
      { kind: "stars", text: "**" },
    ]);
  });

  it("ignores lowercase blanks and lets a call win over overlapping bold", () => {
    expect(richParts("{{take}}")).toEqual([{ kind: "plain", text: "{{take}}" }]);
    const parts = richParts("**[[Fn]]**");
    expect(parts.map((p) => p.text).join("")).toBe("**[[Fn]]**");
    expect(parts.find((p) => p.kind === "call")?.text).toBe("[[Fn]]");
  });

  it("tints bare SNAKE_CASE constants but not plain capitals or the names inside a fill-in", () => {
    const text = "Set TARGET_KIND and MAX_RETRY_2, not WARNING or snake_case; {{OPTIMIZE_TARGET: path}}";
    const parts = richParts(text);
    expect(parts.map((p) => p.text).join("")).toBe(text);
    expect(parts.filter((p) => p.kind !== "plain")).toEqual([
      { kind: "const", text: "TARGET_KIND" },
      { kind: "const", text: "MAX_RETRY_2" },
      { kind: "fill", text: "{{OPTIMIZE_TARGET: path}}" },
    ]);
    expect(richParts("`A_B`").map((p) => p.kind)).toEqual(["code"]);
  });

  it("Backspace after a call or Delete before it removes the whole call", () => {
    const text = "a [[Fn: x = 1]] b";
    expect(deleteCall(text, 15, 15, true)).toEqual({ text: "a  b", caret: 2 });
    expect(deleteCall(text, 2, 2, false)).toEqual({ text: "a  b", caret: 2 });
    expect(deleteCall(text, 14, 14, true)).toBeNull();
    expect(deleteCall(text, 2, 15, true)).toBeNull();
    expect(deleteCall("no calls", 3, 3, true)).toBeNull();
  });
  it("marks Markdown code, fences, headings and list markers without changing the text", () => {
    const text = "## Steps\n1. Run `python3 -m unittest {{KIT}}` then **ship**\n- see `a **b** c`\n```sh\necho [[Fn]] {{DIR}}\n```\nafter";
    const parts = richParts(text);
    expect(parts.map((p) => p.text).join("")).toBe(text);
    expect(parts.filter((p) => p.kind !== "plain")).toEqual([
      { kind: "heading", text: "## Steps" },
      { kind: "list", text: "1." },
      { kind: "code", text: "`python3 -m unittest " },
      { kind: "fill", text: "{{KIT}}" },
      { kind: "code", text: "`" },
      { kind: "stars", text: "**" },
      { kind: "bold", text: "ship" },
      { kind: "stars", text: "**" },
      { kind: "list", text: "-" },
      { kind: "code", text: "`a **b** c`" },
      { kind: "fenceMark", text: "```sh" },
      { kind: "fence", text: "\necho " },
      { kind: "call", text: "[[Fn]]" },
      { kind: "fence", text: " " },
      { kind: "fill", text: "{{DIR}}" },
      { kind: "fence", text: "\n" },
      { kind: "fenceMark", text: "```" },
    ]);
  });

  it("runs an unclosed fence to the end and leaves inline backticks inside it alone", () => {
    const text = "a\n```\n`x` **y**";
    const parts = richParts(text);
    expect(parts.map((p) => p.text).join("")).toBe(text);
    expect(parts).toEqual([
      { kind: "plain", text: "a\n" },
      { kind: "fenceMark", text: "```" },
      { kind: "fence", text: "\n`x` **y**" },
    ]);
  });

  it("marks the A/B markers and keeps the text whole", () => {
    const t = "a {{#if play_bot}}x{{#elif v == \"b\"}}y{{#else}}z{{/if}} {{@v}} {{Fill}} [[Fn]]";
    const parts = richParts(t);
    expect(parts.map((p) => p.text).join("")).toBe(t);
    expect(parts.filter((p) => p.kind === "flag").map((p) => p.text)).toEqual(["{{#if play_bot}}", '{{#elif v == "b"}}', "{{#else}}", "{{/if}}", "{{@v}}"]);
    expect(parts.some((p) => p.kind === "fill" && p.text === "{{Fill}}")).toBe(true);
    expect(parts.some((p) => p.kind === "call")).toBe(true);
  });
});
