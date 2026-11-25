import { describe, expect, it } from "vitest";
import { isTyping, keyLabel, matches } from "./keys";

const ev = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);

describe("keys", () => {
  it("matches mod shortcuts with Ctrl off macOS", () => {
    expect(matches(ev({ key: "k", ctrlKey: true }), { key: "k", mod: true })).toBe(true);
    expect(matches(ev({ key: "k" }), { key: "k", mod: true })).toBe(false);
    expect(matches(ev({ key: "Z", ctrlKey: true, shiftKey: true }), { key: "z", mod: true, shift: true })).toBe(true);
    expect(matches(ev({ key: "z", ctrlKey: true, shiftKey: true }), { key: "z", mod: true })).toBe(false);
  });

  it("a ctrl spec is the Ctrl key itself on every platform, never Cmd", () => {
    expect(matches(ev({ key: "k", ctrlKey: true }), { key: "k", ctrl: true })).toBe(true);
    expect(matches(ev({ key: "k", metaKey: true }), { key: "k", ctrl: true })).toBe(false);
    expect(matches(ev({ key: "k" }), { key: "k", ctrl: true })).toBe(false);
  });

  it("treats symbols as already shifted and matches by code", () => {
    expect(matches(ev({ key: "?", shiftKey: true }), { key: "?" })).toBe(true);
    expect(matches(ev({ key: "Î", code: "KeyD", altKey: true, shiftKey: true }), { key: "d", code: "KeyD", alt: true, shift: true })).toBe(true);
  });

  it("labels shortcuts", () => {
    expect(keyLabel({ key: "Enter", mod: true })).toBe("Ctrl+Enter");
    expect(keyLabel({ key: "1" })).toBe("1");
  });

  it("knows when keys belong to a text field", () => {
    expect(isTyping(document.createElement("textarea"))).toBe(true);
    const box = document.createElement("input");
    box.type = "checkbox";
    expect(isTyping(box)).toBe(false);
    expect(isTyping(document.createElement("input"))).toBe(true);
    expect(isTyping(document.body)).toBe(false);
  });
});
