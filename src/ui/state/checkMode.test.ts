// @lat: [[ui#Workflow links#Check mode]]
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initCheckMode, isCheckMode, MemoryStorage } from "./checkMode";

describe("MemoryStorage", () => {
  it("stores, lists and forgets values like localStorage", () => {
    const s = new MemoryStorage();
    s.setItem("a", "1");
    s.setItem("b", "2");
    expect(s.getItem("a")).toBe("1");
    expect(s.length).toBe(2);
    expect(s.key(1)).toBe("b");
    expect(s.key(5)).toBeNull();
    s.removeItem("a");
    expect(s.getItem("a")).toBeNull();
    s.clear();
    expect(s.length).toBe(0);
  });
});

describe("initCheckMode", () => {
  let original: Storage;
  beforeEach(() => {
    original = window.localStorage;
    original.clear();
  });
  afterEach(() => {
    Object.defineProperty(window, "localStorage", { value: original, configurable: true });
    Object.defineProperty(globalThis, "localStorage", { value: original, configurable: true });
    initCheckMode("");
    original.clear();
  });

  // @lat: [[ui#Tests#Check mode never touches saved data]]
  it("turns on for a check link and keeps writes away from the real storage", () => {
    original.setItem("promptdraw:config", "saved");
    expect(initCheckMode("#wf=abc&check")).toBe(true);
    expect(isCheckMode()).toBe(true);
    expect(localStorage.getItem("promptdraw:config")).toBeNull();
    localStorage.setItem("k", "v");
    expect(original.getItem("k")).toBeNull();
    expect(original.getItem("promptdraw:config")).toBe("saved");
  });

  it("stays off for a normal link", () => {
    expect(initCheckMode("#wf=abc")).toBe(false);
    expect(isCheckMode()).toBe(false);
    expect(window.localStorage).toBe(original);
  });
});
