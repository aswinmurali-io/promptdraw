import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AppAction } from "../actions";
import { Toolbar } from "./Toolbar";

const act = (id: string, label: string, enabled = true): AppAction => ({ id, label, category: "Panels", icon: "copy", enabled, perform: () => {} });

describe("Toolbar", () => {
  it("arrow keys visit a greyed-out tool (it explains itself) and wrap around", () => {
    render(<Toolbar actions={[act("panel.output", "Prompt panel"), act("prompt.copy", "Copy prompt", false), act("help.palette", "Command palette")]} />);
    const prompt = screen.getByRole("button", { name: "Prompt panel" });
    const copy = screen.getByRole("button", { name: "Copy prompt" });
    expect(copy).toHaveAttribute("aria-disabled", "true");
    prompt.focus();
    fireEvent.keyDown(prompt, { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "Command palette" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(copy).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(prompt).toHaveFocus();
  });
});
