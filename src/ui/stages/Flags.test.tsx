// A/B prompt flags on the Stages tab: the fork on the canvas, the Flags popover in the stage bar
// and the inspector's "Show when" and flag declarations, driven through the whole app.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Workflow, appDefaults, serializeAppConfig, type WorkflowDict } from "../../core";
import { App } from "../App";

const stage = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, type: "stage", name, prompt: name + " body", ...extra });

function forked(): WorkflowDict {
  return new Workflow({
    name: "ab",
    goal: "Ship it",
    flags: [{ name: "play_bot", type: "bool", default: false, label: "Use Play Bot" }, { name: "variant", type: "text", default: "a" }],
    blocks: [stage("b1", "Before"), stage("b2", "New way", { when: "play_bot" }), stage("b3", "Old way", { when: "!play_bot" }), stage("b4", "After", { when: 'variant == "b"' })],
  }).toDict();
}

function seed(workflow: WorkflowDict, over: Record<string, unknown> = {}) {
  const cfg = { ...appDefaults(), tab: "stages" as const, workflow, ...over };
  localStorage.setItem("promptdraw:config", serializeAppConfig(cfg));
  localStorage.setItem("promptdraw:prefs", JSON.stringify({ showProps: true, showOutput: true, zoom: 100, welcomeDismissed: true }));
}

const surface = () => screen.getByTestId("stage-surface");
const card = (key: string) => surface().querySelector(`[data-hit="node"][data-key="${key}"]`) as SVGElement;
const output = () => screen.getByTestId("prompt-output").textContent ?? "";
const tags = () => [...surface().querySelectorAll(".sk-fork-tags .sk-variant text")].map((t) => t.textContent);
const tagEl = (kind: string, key: string) => surface().querySelector(`[data-tag="${kind}"][data-key="${key}"]`) as SVGElement;
function click(el: Element) {
  const o = { pointerId: 1, button: 0, clientX: 10, clientY: 10 };
  fireEvent.pointerDown(el, o);
  fireEvent.pointerUp(el, o);
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("promptdraw:promptView", "markdown");
  localStorage.setItem("promptdraw:intro", "seen");
  Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
});
afterEach(() => localStorage.clear());

describe("A/B forks on the canvas", () => {
  it("draws the fork round the two lanes, each tagged, the chosen one solid and the other dimmed", () => {
    seed(forked());
    render(<App />);
    expect(surface().querySelectorAll(".sk-fork").length).toBe(1);
    expect(tags()).toEqual(["A · play_bot · not selected", "✓ B · !play_bot"]);
    expect(card("b2").getAttribute("data-variant")).toBe("off");
    expect(card("b3").getAttribute("data-variant")).toBe("on");
    expect(card("b1").getAttribute("data-variant")).toBeNull();
  });

  it("gives a lone when block a badge on its own card instead of a fork", () => {
    seed(forked());
    render(<App />);
    expect(card("b4").getAttribute("data-variant")).toBe("off");
    expect(surface().querySelector('[data-tag="lone"][data-key="b4"] text')?.textContent).toMatch(/A · variant == "b" · not selected/);
  });

  it("keeps both variants in the prompt by default and marks the one to follow", () => {
    seed(forked());
    render(<App />);
    expect(output()).toContain("New way [Variant A (play_bot): skip, not selected]");
    expect(output()).toContain("Old way [Variant B (!play_bot): use]");
  });
});

describe("the Flags popover", () => {
  const open = () => fireEvent.click(screen.getByRole("button", { name: "Prompt flags" }));

  it("is absent until the workflow declares a flag", () => {
    seed(new Workflow({ name: "plain", blocks: [stage("b1", "A")] }).toDict());
    render(<App />);
    expect(screen.queryByRole("button", { name: "Prompt flags" })).toBeNull();
  });

  it("flips the variant on the canvas and in the prompt as a flag is toggled", () => {
    seed(forked());
    render(<App />);
    open();
    const pop = screen.getByRole("dialog", { name: "Prompt flags" });
    fireEvent.click(within(pop).getByRole("checkbox", { name: /play_bot/ }));
    expect(tags()).toEqual(["✓ A · play_bot", "B · !play_bot · not selected"]);
    expect(card("b2").getAttribute("data-variant")).toBe("on");
    expect(output()).toContain("New way [Variant A (play_bot): use]");
  });

  it("takes text for a text flag", () => {
    seed(forked());
    render(<App />);
    open();
    fireEvent.change(within(screen.getByRole("dialog", { name: "Prompt flags" })).getByLabelText("variant"), { target: { value: "b" } });
    expect(card("b4").getAttribute("data-variant")).toBe("on");
  });

  it("strips the variants not chosen when asked, and says so on the canvas", () => {
    seed(forked());
    render(<App />);
    open();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Prompt flags" })).getByLabelText("Strip the others"));
    expect(output()).not.toContain("New way");
    expect(output()).toContain("Old way");
    expect(card("b2").getAttribute("data-flag-mode")).toBe("strip");
    expect(tags()[0]).toBe("A · play_bot · removed");
  });

  it("closes on Escape and on a press outside", () => {
    seed(forked());
    render(<App />);
    open();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Prompt flags" })).toBeNull();
    open();
    fireEvent.pointerDown(surface());
    expect(screen.queryByRole("dialog", { name: "Prompt flags" })).toBeNull();
  });
});

describe("pressing the A/B tags", () => {
  const inlineWf = () =>
    new Workflow({
      name: "ab",
      goal: "Ship it",
      flags: [{ name: "play_bot", type: "bool", default: false }, { name: "t", type: "text", default: "" }],
      blocks: [stage("b1", "Split", { prompt: "Do {{#if play_bot}}new{{#else}}old{{/if}}" }), stage("b2", "Gated", { when: "t" })],
    }).toDict();

  it("switches to a lane's variant from its tag, and the canvas and the prompt follow", () => {
    seed(forked());
    render(<App />);
    expect(card("b3").getAttribute("data-variant")).toBe("on");
    click(tagEl("lane", "b2"));
    expect(tags()).toEqual(["✓ A · play_bot", "B · !play_bot · not selected"]);
    expect(card("b2").getAttribute("data-variant")).toBe("on");
    expect(output()).toContain("New way [Variant A (play_bot): use]");
    click(tagEl("lane", "b3"));
    expect(card("b3").getAttribute("data-variant")).toBe("on");
    expect(output()).toContain("Old way [Variant B (!play_bot): use]");
  });

  it("switches from the lane's own room, not only its tag", () => {
    seed(forked());
    render(<App />);
    const lane = surface().querySelector('.sk-lane[data-key="b2"]') as SVGElement;
    expect(lane.getAttribute("data-hit")).toBe("variant");
    click(lane);
    expect(card("b2").getAttribute("data-variant")).toBe("on");
  });

  it("sets a text flag to the value a lone tag's condition names", () => {
    seed(forked());
    render(<App />);
    click(tagEl("lone", "b4"));
    expect(card("b4").getAttribute("data-variant")).toBe("on");
    expect(output()).toContain("After [Variant A (variant == \"b\"): use]");
  });

  it("opens the flags beside the press, on that flag, from the fork's pill", () => {
    seed(forked());
    render(<App />);
    click(tagEl("fork", "play_bot"));
    const pop = screen.getByRole("dialog", { name: "Prompt flags" });
    expect(pop.getAttribute("data-at")).toBe("true");
    expect(document.activeElement).toBe(within(pop).getByRole("checkbox", { name: /play_bot/ }));
  });

  it("opens the flags from a card's inline A/B tag, which says the flag, the branches and the one followed", () => {
    seed(inlineWf());
    render(<App />);
    const inline = tagEl("inline", "play_bot");
    expect(inline.querySelector("text")?.textContent).toBe("A/B · play_bot · 2 branches → B");
    expect(card("b1").getAttribute("data-inline")).toBe("B");
    click(inline);
    const pop = screen.getByRole("dialog", { name: "Prompt flags" });
    expect(document.activeElement).toBe(within(pop).getByRole("checkbox", { name: /play_bot/ }));
    fireEvent.click(within(pop).getByRole("checkbox", { name: /play_bot/ }));
    expect(inline.querySelector("text")?.textContent).toBe("A/B · play_bot · 2 branches → A");
  });

  it("opens the flags on the flag when no single value satisfies the lane's condition", () => {
    seed(inlineWf());
    render(<App />);
    click(tagEl("lone", "b2"));
    const pop = screen.getByRole("dialog", { name: "Prompt flags" });
    expect(document.activeElement).toBe(within(pop).getByLabelText("t"));
  });

  it("makes every tag a keyboard control with a name and a tooltip, and Enter or Space presses it", () => {
    seed(forked());
    render(<App />);
    const lane = tagEl("lane", "b2");
    expect(lane.getAttribute("role")).toBe("button");
    expect(lane.getAttribute("tabindex")).toBe("0");
    expect(lane.getAttribute("aria-pressed")).toBe("false");
    expect(lane.getAttribute("aria-label")).toBe("Variant A of play_bot, not chosen. Press to switch to it");
    expect(lane.querySelector("title")?.textContent).toBe("Click to switch to variant A");
    expect(tagEl("lane", "b3").querySelector("title")?.textContent).toBe("Variant B is chosen");
    expect(tagEl("fork", "play_bot").getAttribute("aria-label")).toMatch(/open the prompt flags/);
    fireEvent.keyDown(lane, { key: "Enter" });
    expect(card("b2").getAttribute("data-variant")).toBe("on");
    fireEvent.keyDown(tagEl("lane", "b3"), { key: " " });
    expect(card("b3").getAttribute("data-variant")).toBe("on");
  });

  it("keeps the stage bar's Flags tool opening the popover above the bar", () => {
    seed(forked());
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Prompt flags" }));
    const pop = screen.getByRole("dialog", { name: "Prompt flags" });
    expect(pop.getAttribute("data-at")).toBeNull();
  });

  it("shows the branches of a block in the inspector, the chosen one marked and following the flags", () => {
    seed(inlineWf());
    render(<App />);
    click(card("b1"));
    const chain = screen.getByTestId("branches-chain");
    const rows = chain.querySelectorAll(".insp-branch");
    expect([...rows].map((r) => r.getAttribute("data-chosen"))).toEqual([null, "true"]);
    expect(rows[0]?.textContent).toMatch(/Variant A · play_bot/);
    expect(rows[1]?.textContent).toMatch(/Variant B · otherwise.*chosen.*old/);
    click(card("b1"));
    fireEvent.click(screen.getByRole("button", { name: "Prompt flags" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Prompt flags" })).getByRole("checkbox", { name: /play_bot/ }));
    expect([...screen.getByTestId("branches-chain").querySelectorAll(".insp-branch")].map((r) => r.getAttribute("data-chosen"))).toEqual(["true", null]);
  });
});

describe("the inspector", () => {
  it("edits a block's Show when, refusing a condition that cannot be read or names no flag", () => {
    seed(forked());
    render(<App />);
    click(card("b1"));
    const field = screen.getByRole("textbox", { name: "Show when" });
    fireEvent.change(field, { target: { value: "nope" } });
    expect(screen.getByRole("alert").textContent).toMatch(/No flag named nope/);
    fireEvent.change(field, { target: { value: "play_bot ==" } });
    expect(screen.getByRole("alert").textContent).toMatch(/cannot read/);
    expect(card("b1").getAttribute("data-variant")).toBeNull();
    fireEvent.change(field, { target: { value: "!play_bot" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(card("b1").getAttribute("data-variant")).toBe("on");
    expect(screen.getByTestId("variant-note").textContent).toMatch(/Variant A of play_bot: chosen/);
  });

  it("declares and removes flags from the Goal, which brings the Flags tool", () => {
    seed(new Workflow({ name: "plain", blocks: [stage("b1", "A")] }).toDict());
    render(<App />);
    click(card("goal"));
    fireEvent.click(screen.getByRole("button", { name: "+ Add flag" }));
    const group = screen.getByRole("group", { name: "Flag flag_a" });
    expect(screen.getByRole("button", { name: /prompt flags/i })).toBeTruthy();
    fireEvent.click(within(group).getByLabelText("Text"));
    expect(within(group).getByLabelText("Flag flag_a default")).toBeTruthy();
    fireEvent.click(within(group).getByRole("button", { name: "Remove" }));
    expect(screen.queryByRole("group", { name: "Flag flag_a" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Prompt flags" })).toBeNull();
  });

  it("lists flag problems such as a flag nothing uses", () => {
    seed(new Workflow({ name: "plain", flags: [{ name: "spare" }], blocks: [stage("b1", "A")] }).toDict());
    render(<App />);
    click(card("goal"));
    expect(screen.getByText(/'spare' is declared but nothing uses it/)).toBeTruthy();
  });
});
