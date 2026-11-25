import { describe, expect, it } from "vitest";
import { insertPhrase } from "./useDictation";

describe("insertPhrase", () => {
  // @lat: [[stages#Stage editor#Tests#Dictated phrase spacing]]
  it("spaces a phrase from its neighbours and puts the caret after it", () => {
    expect(insertPhrase("", 0, " hello ")).toEqual({ text: "hello", caret: 5 });
    expect(insertPhrase("build it", 5, "the app")).toEqual({ text: "build the app it", caret: 13 });
    expect(insertPhrase("build", 5, "it")).toEqual({ text: "build it", caret: 8 });
    expect(insertPhrase("a\n", 2, "next")).toEqual({ text: "a\nnext", caret: 6 });
    expect(insertPhrase("x", 0, "  ")).toEqual({ text: "x", caret: 0 });
    expect(insertPhrase("ab", 99, "c")).toEqual({ text: "ab c", caret: 4 });
  });
});
