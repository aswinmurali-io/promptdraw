import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { REPO_URL, ribbonEdge } from "../lib/ribbon";
import { GitHubRibbon } from "./GitHubRibbon";

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });
const menu = box(12, 12, 91, 56);

describe("ribbonEdge", () => {
  it("takes the window corner when nothing sits under the band", () => {
    expect(ribbonEdge(1440, [menu, box(500, 12, 900, 56)])).toBe(1440);
  });

  it("sits left of a panel holding the right edge from the top", () => {
    expect(ribbonEdge(1440, [menu, box(231, 12, 577, 56), box(720, 0, 1440, 900)])).toBe(720);
  });

  it("hides rather than hang beside the How to work button", () => {
    expect(ribbonEdge(1440, [menu, box(547, 12, 893, 56), box(1310, 12, 1428, 56)])).toBeNull();
  });

  it("hides rather than hang above a floating panel like the starters", () => {
    expect(ribbonEdge(1100, [menu, box(300, 12, 800, 56), box(1012, 12, 1088, 56), box(700, 68, 1088, 600)])).toBeNull();
  });

  it("hides when the toolbar reaches under the band", () => {
    expect(ribbonEdge(1440, [menu, box(357, 12, 1083, 56), box(1012, 68, 1428, 840)])).toBeNull();
  });
});

describe("GitHubRibbon", () => {
  it("links to the repository in a new tab", () => {
    render(<GitHubRibbon />);
    const link = screen.getByRole("link", { name: /star promptdraw on github/i });
    expect(link).toHaveAttribute("href", REPO_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
