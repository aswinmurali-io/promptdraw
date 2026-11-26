import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appDefaults, appState, buildPrompt, copyText, serializeAppConfig, toYaml, TOGGLE_ORDER, Workflow } from "../core";
import { sample } from "../test/fixtures";
import { App } from "./App";
import { INTENT_GROUPS } from "./lib/intentGroups";
import { encodePayload } from "./lib/link";
import { starterWorkflow } from "./stages/starters";

/** On the Simple task tab the Prompt panel shares the right edge with How to work: ask for it. */
function showPrompt(): void {
  fireEvent.keyDown(document.body, { key: "4" });
}

function output(): string {
  return screen.getByTestId("prompt-output").textContent ?? "";
}

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Unmounting flushes autosave after the previous test's afterEach, so start clean here.
  localStorage.clear();
  // These tests read and edit the raw prompt: the Markdown view (the Preview has its own tests).
  localStorage.setItem("promptdraw:promptView", "markdown");
  // The first-visit intro video has its own tests below; the rest start past it.
  localStorage.setItem("promptdraw:intro", "seen");
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
});

describe("App shell", () => {
  it("renders the task canvas with labelled fields", () => {
    render(<App />);
    expect(screen.getByRole("main", { name: "Task prompt canvas" })).toBeInTheDocument();
    expect(screen.getByLabelText("Task")).toBeInTheDocument();
    expect(screen.getByLabelText("Extra notes")).toBeInTheDocument();
  });
});

describe("prompt output", () => {
  it("shows the compiled prompt for the app defaults, byte for byte", () => {
    render(<App />);
    const [prompt, sections] = buildPrompt(appState(appDefaults()));
    expect(output()).toBe(prompt);
    for (const s of sections) expect(screen.getByText(s, { selector: ".chip" })).toBeInTheDocument();
  });

  it("updates live as the task is typed", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Task"), { target: { value: "ship the shop screen" } });
    expect(output()).toContain("## Task\n\nship the shop screen\n");
    expect(screen.queryByText("notes", { selector: ".chip" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Extra notes"), { target: { value: "side note" } });
    expect(output()).toContain("## Extra notes\n\nside note\n");
    expect(screen.getByText("notes", { selector: ".chip" })).toBeInTheDocument();
  });

  it("copies the prompt without trailing newlines and confirms with a toast", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Task"), { target: { value: "copy me" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    });
    const cfg = { ...appDefaults(), task: "copy me" };
    expect(writeText).toHaveBeenCalledWith(copyText(buildPrompt(appState(cfg))[0]));
    expect(screen.getByRole("status")).toHaveTextContent("Copied to clipboard");
    // Read out, but not drawn over the board: the Copy button says "Copied" itself.
    expect(screen.getByRole("status").querySelector(".toast")).toBeNull();
    expect(screen.getByRole("status").querySelector(".visually-hidden")).toHaveTextContent("Copied to clipboard");
    expect(screen.getByText("copied to clipboard")).toBeInTheDocument();
    // The button itself says so for a moment, with a tick.
    expect(screen.getByRole("button", { name: /^Copied \(Copy prompt\)$/ })).toHaveTextContent("Copied");
  });

  it("shows a character count", () => {
    render(<App />);
    const chars = copyText(buildPrompt(appState(appDefaults()))[0]).length;
    expect(screen.getByTestId("char-count")).toHaveTextContent(`${chars.toLocaleString("en-US")} chars`);
  });
});

describe("intention toggles", () => {
  it("toggling a card adds its line to the prompt and removing it takes it out", () => {
    render(<App />);
    const tests = screen.getByRole("checkbox", { name: /Tests matter/ });
    expect(output()).not.toContain("**Tests matter**");
    fireEvent.click(tests);
    expect(tests).toBeChecked();
    expect(output()).toContain("- **Tests matter** — Write edit-mode tests");
    expect(screen.getByText("how to work +1", { selector: ".chip" })).toBeInTheDocument();
    fireEvent.click(tests);
    expect(output()).not.toContain("**Tests matter**");
  });

  it("draws each ticked option as a parallel lane into the Prompt, and a lane's × unticks it", () => {
    render(<App />);
    const lanes = () => screen.getByRole("region", { name: "How the task runs" });
    const cards = () => [...lanes().querySelectorAll(".sk-card")].map((c) => c.getAttribute("data-key"));
    expect(within(lanes()).getByText(/Tick an option under How to work/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Tests matter/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Reduce assumptions/ }));
    // Drawn by the Stages renderer: the Goal card, stage cards in a parallel frame, then the Prompt card.
    expect(cards()).toEqual(["goal", "assumptions", "tests", "prompt_out"]);
    expect(within(lanes()).getByText("⇉ parallel · wait for all")).toBeInTheDocument();
    expect(screen.getByText("2 on")).toBeInTheDocument();
    // The card's × unticks its option, as the hidden list's button does for keyboards.
    fireEvent.click(lanes().querySelector('[data-hit="del"][data-key="assumptions"]')!);
    expect(screen.getByRole("checkbox", { name: /Reduce assumptions/ })).not.toBeChecked();
    fireEvent.click(within(lanes()).getByRole("button", { name: "Remove Tests matter" }));
    expect(screen.getByRole("checkbox", { name: /Tests matter/ })).not.toBeChecked();
    expect(output()).not.toContain("**Tests matter**");
  });

  it("keeps the Task fields in How to work, and the board's Goal card opens them", () => {
    render(<App />);
    const panel = document.querySelector(".work-panel") as HTMLElement;
    expect(within(panel).getByLabelText("Task")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Extra notes")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Task"), { target: { value: "Ship the shop" } });
    const lanes = screen.getByRole("region", { name: "How the task runs" });
    const goal = lanes.querySelector('.sk-card[data-key="goal"]') as Element;
    expect(goal.textContent).toContain("Ship the shop");
    // Closed, then reopened by the Goal card (or its hidden button for keyboards).
    fireEvent.click(screen.getByRole("button", { name: "Close How to work" }));
    fireEvent.click(within(lanes).getByRole("button", { name: "Edit the task" }));
    expect(panel).not.toHaveAttribute("data-closed");
  });

  it("splits How to work at 40% with a divider the keyboard can move", () => {
    render(<App />);
    const divider = screen.getByRole("separator", { name: "Resize the task section" });
    expect(divider).toHaveAttribute("aria-valuenow", "40");
    fireEvent.keyDown(divider, { key: "ArrowDown" });
    expect(divider).toHaveAttribute("aria-valuenow", "45");
    fireEvent.keyDown(divider, { key: "End" });
    expect(divider).toHaveAttribute("aria-valuenow", "80");
    fireEvent.doubleClick(divider);
    expect(divider).toHaveAttribute("aria-valuenow", "40");
  });

  it("offers Fit on the Simple task zoom island", () => {
    render(<App />);
    expect(within(screen.getByRole("group", { name: "Zoom" })).getByRole("button", { name: "Zoom to fit" })).toBeInTheDocument();
  });

  it("lists the demo workflows on an empty Stages board and hides them once one opens", () => {
    localStorage.setItem("promptdraw:prefs", JSON.stringify({ showProps: false, showOutput: false, zoom: 100, welcomeDismissed: true }));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Stages" }));
    const demos = screen.getByRole("complementary", { name: "Demo workflows" });
    fireEvent.click(within(demos).getByRole("button", { name: "Open the Sprint Chaser demo" }));
    expect(screen.queryByRole("complementary", { name: "Demo workflows" })).toBeNull();
  });

  it("opens the Prompt from the board", () => {
    localStorage.setItem("promptdraw:prefs", JSON.stringify({ showProps: false, showOutput: false, zoom: 100, welcomeDismissed: true }));
    render(<App />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Multiple workers/ }));
    fireEvent.click(within(screen.getByRole("region", { name: "How the task runs" })).getByRole("button", { name: /prompt/i }));
    expect(document.querySelector(".output-panel")).not.toBeNull();
  });

  it("chains, locks and loops options on the board as the Stages board would", () => {
    render(<App />);
    const lanes = () => screen.getByRole("region", { name: "How the task runs" });
    const card = (k: string) => lanes().querySelector(`.sk-card[data-key="${k}"]`);
    fireEvent.click(screen.getByRole("checkbox", { name: /Multiple workers/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Recon via workers/ }));
    // Recon fans out into three read-only recon workers in a frame of their own.
    expect(["recon_1", "recon_2", "recon_3"].every((k) => card(k))).toBe(true);
    expect(card("recon_1")?.textContent).toContain("Recon A");
    expect(card("recon_1")?.textContent).toContain("opus");
    expect(card("recon_1")).toHaveClass("sk-card--function");
    fireEvent.click(screen.getByRole("checkbox", { name: /Basic code review/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Self-loop code review/ }));
    expect(within(lanes()).getByText("AGENTIC LOOP")).toBeInTheDocument();
    expect(card("review_fix")).not.toBeNull();
    expect(card("review")?.textContent).toContain("opus");
    expect(output()).toContain("**Self-loop code review**");
    // Inline agent only: workers and its recon stay on the board, dimmed and locked.
    fireEvent.click(screen.getByRole("checkbox", { name: /Inline agent only/ }));
    expect(card("workers")).toHaveAttribute("data-locked");
    expect(card("recon_2")).toHaveAttribute("data-locked");
    // Unticking the review unticks its loop.
    fireEvent.click(screen.getByRole("checkbox", { name: /Basic code review/ }));
    expect(screen.getByRole("checkbox", { name: /Self-loop code review/ })).not.toBeChecked();
    expect(output()).not.toContain("**Self-loop code review**");
  });

  it("draws UI intelligence as an agentic loop of its steps", () => {
    render(<App />);
    const lanes = () => screen.getByRole("region", { name: "How the task runs" });
    fireEvent.click(screen.getByRole("checkbox", { name: /UI intelligence/ }));
    const steps = ["ui_shot", "ui_analyse", "ui_iterate", "ui_critique"].map((k) => lanes().querySelector(`.sk-card[data-key="${k}"]`));
    expect(steps.every(Boolean)).toBe(true);
    expect(steps[0]?.textContent).toContain("Screenshot");
    expect(within(lanes()).getByText("AGENTIC LOOP")).toBeInTheDocument();
    expect(within(lanes()).getByText(/until it meets the goal/)).toBeInTheDocument();
    // Any step's × unticks the option.
    fireEvent.click(screen.getByRole("button", { name: "Remove UI intelligence" }));
    expect(screen.getByRole("checkbox", { name: /UI intelligence/ })).not.toBeChecked();
  });

  it("closes How to work with its × and brings it back", () => {
    render(<App />);
    const panel = () => document.querySelector(".work-panel") as HTMLElement;
    fireEvent.click(screen.getByRole("button", { name: "Close How to work" }));
    expect(panel()).toHaveAttribute("data-closed");
    expect(document.querySelector(".app")).toHaveAttribute("data-work", "closed");
    fireEvent.click(screen.getByRole("button", { name: "Show How to work" }));
    expect(panel()).not.toHaveAttribute("data-closed");
    expect(document.querySelector(".app")).toHaveAttribute("data-work", "open");
  });

  it("filters How to work with the search field", () => {
    render(<App />);
    const search = screen.getByRole("searchbox", { name: "Search How to work options" });
    fireEvent.change(search, { target: { value: "review" } });
    expect(screen.getByRole("checkbox", { name: /Basic code review/ })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Tests matter/ })).toBeNull();
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByText(/No option matches/)).toBeInTheDocument();
    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.getByRole("checkbox", { name: /Tests matter/ })).toBeInTheDocument();
  });

  it("keeps recon locked until workers is on, and inline locks both", () => {
    render(<App />);
    const recon = screen.getByRole("checkbox", { name: /Recon via workers/ });
    const workers = screen.getByRole("checkbox", { name: /Multiple workers/ });
    expect(recon).toBeDisabled();
    fireEvent.click(workers);
    expect(recon).toBeEnabled();
    fireEvent.click(recon);
    expect(output()).toContain("**Recon via workers**");
    fireEvent.click(screen.getByRole("checkbox", { name: /Inline agent only/ }));
    expect(workers).toBeDisabled();
    expect(recon).toBeDisabled();
    expect(output()).not.toContain("**Multiple workers**");
  });

  it("renders every toggle once, in its group's order", () => {
    render(<App />);
    const labels = screen
      .getAllByRole("checkbox")
      .filter((c) => c.id.startsWith("intent-"))
      .map((c) => c.id.replace("intent-", ""));
    expect(labels).toEqual(INTENT_GROUPS.flatMap(([, keys]) => keys));
    expect([...labels].sort()).toEqual([...TOGGLE_ORDER].sort());
  });
});

describe("properties panel", () => {
  // Settings starts closed on a first visit; these tests open it as a returning visitor would.
  beforeEach(() => localStorage.setItem("promptdraw:prefs", JSON.stringify({ showProps: true, showOutput: true, zoom: 100, welcomeDismissed: true })));

  it("edits workspace settings and the prompt follows", () => {
    render(<App />);
    // Branch, worktree and Unity start off: the prompt says nothing about them.
    expect(output()).not.toContain("branch");
    expect(output()).not.toContain("worktree");
    expect(output()).not.toContain("## Unity");
    expect(screen.getByRole("textbox", { name: "Base branch" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Verify Unity CLI targets this run's editor" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Same branch" }));
    expect(output()).toContain("- Work on the current branch. Do NOT create a new branch.");
    fireEvent.change(screen.getByRole("textbox", { name: "Base branch" }), { target: { value: "main" } });
    expect(output()).toContain("Work on branch `main`");
    fireEvent.click(screen.getByRole("radio", { name: "No worktree" }));
    expect(screen.getByRole("checkbox", { name: "Copy .env files" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Use the Unity editor that is already running" }));
    expect(output()).toContain("## Unity");
    fireEvent.click(screen.getByRole("checkbox", { name: "Verify Unity CLI targets this run's editor" }));
    expect(screen.getByText("unity", { selector: ".chip" })).toBeInTheDocument();
  });

  it("shows a ticked option's settings under it in How to work, and not in Settings", () => {
    render(<App />);
    expect(screen.queryByRole("checkbox", { name: "Spec only, skip plan" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /Superpowers/ }));
    const group = screen.getByRole("group", { name: "Superpowers settings" });
    fireEvent.click(within(group).getByRole("checkbox", { name: "Spec only, skip plan" }));
    expect(output()).toContain("`writing-plans`");
    expect(document.querySelector(".props-panel")?.textContent ?? "").not.toContain("Spec only");
    // Recon: up to five agents, the prompt saying so once a cap is picked.
    fireEvent.click(screen.getByRole("checkbox", { name: /Multiple workers/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Recon via workers/ }));
    const agents = within(screen.getByRole("group", { name: "Recon via workers settings" })).getByRole("combobox", { name: "Recon agents" });
    expect([...agents.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["Not set", "at most 1", "at most 2", "at most 3", "at most 4", "at most 5"]);
    fireEvent.change(agents, { target: { value: "5" } });
    expect(output()).toContain("to at most 5 parallel worker subagents");
    // Inline agent only locks recon: its settings fold away with it.
    fireEvent.click(screen.getByRole("checkbox", { name: /Inline agent only/ }));
    expect(screen.queryByRole("group", { name: "Recon via workers settings" })).toBeNull();
  });

  it("resets the task and every option from How to work, after asking", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Task"), { target: { value: "ship it" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Tests matter/ }));
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    const dialog = screen.getByRole("alertdialog", { name: "Reset" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset" }));
    expect(screen.getByLabelText("Task")).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: /Tests matter/ })).not.toBeChecked();
  });

  it("rejects non-digits in progress minutes and flags a fallback value", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Progress reports/ }));
    const minutes = screen.getByRole("textbox", { name: "Report every" });
    fireEvent.change(minutes, { target: { value: "15" } });
    expect(output()).toContain("Every 15 minutes of work");
    fireEvent.change(minutes, { target: { value: "15a" } });
    expect(minutes).toHaveValue("15");
    fireEvent.change(minutes, { target: { value: "1500" } });
    expect(minutes).toHaveValue("15");
    fireEvent.change(minutes, { target: { value: "0" } });
    expect(minutes).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Not a positive number: uses 40 min")).toBeVisible();
    expect(output()).toContain("Every 40 minutes of work");
  });

});

describe("keyboard shortcuts and dialogs", () => {
  it("opens the shortcuts dialog with ? and closes it with Escape", () => {
    render(<App />);
    fireEvent.keyDown(document.body, { key: "?", shiftKey: true });
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveTextContent("Copy prompt");
    // The stage keys are listed from the Task tab too, and so are the canvas gestures.
    expect(within(dialog).getByRole("heading", { name: "Stages tab" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Add stage");
    expect(dialog).toHaveTextContent("Loop selected blocks");
    expect(within(dialog).getByRole("heading", { name: "Canvas gestures" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Zoom toward the pointer");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("switches modes with number keys, but not while typing", () => {
    render(<App />);
    fireEvent.keyDown(document.body, { key: "2" });
    expect(screen.getByRole("main", { name: "Stages canvas" })).toBeInTheDocument();
    expect(document.getElementById("stages-canvas-mount")).not.toBeNull();
    expect(output()).toMatch(/^## Workflow/);
    fireEvent.keyDown(document.body, { key: "1" });
    const task = screen.getByLabelText("Task");
    fireEvent.keyDown(task, { key: "2" });
    expect(screen.getByRole("main", { name: "Task prompt canvas" })).toBeInTheDocument();
  });

  // @lat: [[ui#Tests#Settings live in the Intentions block on Stages]]
  it("keeps the Stages settings in the Intentions inspector, and Settings opens it", () => {
    localStorage.setItem("promptdraw:config", JSON.stringify({ tab: "stages", workflow: { name: "w", goal: "g", blocks: [{ id: "intentions", type: "intentions", toggles: [] }] } }));
    render(<App />);
    expect(document.querySelector(".settings-panel")).toBeNull();
    fireEvent.keyDown(document.body, { key: "3" });
    const insp = screen.getByRole("heading", { name: "Intentions" }).closest("aside") as HTMLElement;
    expect(within(insp).getByRole("heading", { name: "Workspace & Unity" })).toBeInTheDocument();
    fireEvent.click(within(insp).getByRole("radio", { name: "Create new branch" }));
    expect(output()).toContain("Create a new branch");
    fireEvent.click(within(insp).getByRole("radio", { name: /Spawn a Unity editor/ }));
    expect(output()).toMatch(/spawn/i);
    expect(document.querySelector(".settings-panel")).toBeNull();
    fireEvent.keyDown(document.body, { key: "3" });
    expect(screen.queryByRole("heading", { name: "Intentions" })).toBeNull();
  });

  it("falls back to the Settings panel on a workflow without an Intentions block", () => {
    localStorage.setItem("promptdraw:config", JSON.stringify({ tab: "stages" }));
    render(<App />);
    if (!document.querySelector(".settings-panel")) fireEvent.keyDown(document.body, { key: "3" });
    expect(document.querySelector(".settings-panel")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Intentions" })).toBeNull();
  });

  it("undoes and redoes outside text fields", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Push PR/ }));
    expect(output()).toContain("**Push PR**");
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    expect(output()).not.toContain("**Push PR**");
    fireEvent.keyDown(document.body, { key: "y", ctrlKey: true });
    expect(output()).toContain("**Push PR**");
  });
});

describe("editable prompt box", () => {
  it("flags an empty task and asks before copying a prompt with its placeholder", async () => {
    render(<App />);
    showPrompt();
    // A quiet to-do on first load: nothing has been attempted yet.
    expect(screen.getByRole("note")).toHaveTextContent("Task is empty: fill it in to finish the prompt.");
    expect(screen.getByRole("note")).toHaveAttribute("data-tone", "hint");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    });
    const dialog = screen.getByRole("alertdialog");
    // Once a copy was tried with the placeholder in, it is a warning.
    expect(screen.getByRole("note")).toHaveAttribute("data-tone", "warn");
    expect(screen.getByRole("note")).toHaveTextContent("the prompt still has a placeholder");
    expect(dialog).toHaveTextContent("<describe the task here>");
    expect(writeText).not.toHaveBeenCalled();
    // Fill in: the dialog closes and the caret goes to the Task card.
    fireEvent.click(within(dialog).getByRole("button", { name: "Fill in task" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Task")));
    // Copy anyway copies the prompt as it is.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    });
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Copy anyway" }));
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("<describe the task here>"));
    // A typed task clears the flag.
    fireEvent.change(screen.getByLabelText("Task"), { target: { value: "do it" } });
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("drops the Copied toast when a dialog opens", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Task"), { target: { value: "copy me" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    });
    expect(screen.getByRole("status")).toHaveTextContent("Copied to clipboard");
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
    expect(screen.getByRole("combobox", { name: "Search commands" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("copies hand edits, offers Revert, and recompiles when the inputs change", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Task"), { target: { value: "first" } });
    showPrompt();
    const box = screen.getByLabelText("Compiled prompt");
    const compiled = output();
    fireEvent.change(box, { target: { value: compiled + "my tweak\n" } });
    expect(output()).toBe(compiled + "my tweak\n");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    });
    expect(writeText).toHaveBeenLastCalledWith(copyText(compiled + "my tweak\n"));
    fireEvent.click(screen.getByRole("button", { name: "Revert" }));
    expect(output()).toBe(compiled);
    expect(screen.queryByRole("button", { name: "Revert" })).toBeNull();
    fireEvent.change(box, { target: { value: "scratch" } });
    fireEvent.change(screen.getByLabelText("Task"), { target: { value: "second" } });
    expect(output()).toContain("## Task\n\nsecond\n");
    expect(output()).not.toContain("scratch");
  });

  it("mutes only bullets at the start of a line, like the Python app", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Compiled prompt"), { target: { value: "- top\n  - nested\n" } });
    const bullets = screen.getByTestId("prompt-output").querySelectorAll(".md-bullet");
    expect([...bullets].map((b) => b.textContent)).toEqual(["- "]);
  });

  it("draws ** markers and a stage line's dangling dash faint, keeping the text as is", () => {
    render(<App />);
    const text = "1. **Stage 1** –\n2. **Fix** – the bug\na - b -\n";
    fireEvent.change(screen.getByLabelText("Compiled prompt"), { target: { value: text } });
    const mirror = screen.getByTestId("prompt-output");
    expect(mirror.textContent).toContain(text.trimEnd());
    expect([...mirror.querySelectorAll(".md-mark")].map((m) => m.textContent)).toEqual(["**", "**", " –", "**", "**"]);
  });
});

describe("prompt preview", () => {
  it("opens as a formatted preview without markdown markers; Copy still takes the raw text", async () => {
    localStorage.removeItem("promptdraw:promptView");
    render(<App />);
    showPrompt();
    const preview = screen.getByTestId("prompt-preview");
    const [prompt] = buildPrompt(appState(appDefaults()));
    expect(preview.textContent).not.toContain("##");
    expect(preview.textContent).not.toContain("**");
    expect(within(preview).getAllByRole("heading").map((h) => h.textContent)).toContain("Task");
    fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    // The empty task asks first; copy anyway.
    fireEvent.click(await screen.findByRole("button", { name: /Copy anyway/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(copyText(prompt)));
  });

  it("switches to the editable Markdown on request and remembers the choice", () => {
    localStorage.removeItem("promptdraw:promptView");
    render(<App />);
    showPrompt();
    fireEvent.doubleClick(screen.getByTestId("prompt-preview"));
    const area = screen.getByLabelText("Compiled prompt");
    expect(area).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Markdown" })).toHaveAttribute("aria-checked", "true");
    expect(localStorage.getItem("promptdraw:promptView")).toBe("markdown");
    fireEvent.click(screen.getByRole("radio", { name: "Preview" }));
    expect(screen.queryByLabelText("Compiled prompt")).toBeNull();
  });
});

describe("import", () => {
  it("imports a Python app config JSON through the file input", async () => {
    render(<App />);
    const json = JSON.stringify({ branch: "same", base: "12.41.0", unity: "existing", mcp_check: false, toggles: { unity_mcp: true, tests: true }, progress_minutes: "10", tab: "task" });
    const file = new File([json], ".prompt_builder.json", { type: "application/json" });
    await act(async () => {
      fireEvent.change(screen.getByTestId("file-input"), { target: { files: [file] } });
    });
    await waitFor(() => expect(output()).toContain("Work on branch `12.41.0`"));
    expect(output()).toContain("**Nudge Unity CLI usage**");
    expect(output()).toContain("**Tests matter**");
    expect(screen.getByText("unity", { selector: ".chip" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loaded .prompt_builder.json");
  });

  it("shows an error toast for a broken file", async () => {
    render(<App />);
    const file = new File(["{broken"], "x.json", { type: "application/json" });
    await act(async () => {
      fireEvent.change(screen.getByTestId("file-input"), { target: { files: [file] } });
    });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("not valid JSON"));
  });
});

describe("main menu", () => {
  function openMenu() {
    fireEvent.click(screen.getByRole("button", { name: "Main menu" }));
    return screen.getByRole("menu", { name: "Main menu" });
  }

  it("lists the file commands with their shortcuts and closes on Escape", () => {
    render(<App />);
    const menu = openMenu();
    expect(screen.getByRole("button", { name: "Main menu" })).toHaveAttribute("aria-expanded", "true");
    expect(within(menu).getByRole("menuitem", { name: /Open…/ })).toHaveTextContent("Ctrl+O");
    expect(within(menu).getByRole("menuitem", { name: /Save settings \(JSON\)/ })).toBeInTheDocument();
    expect(document.activeElement).toBe(within(menu).getAllByRole("menuitem")[0]);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(within(menu).getAllByRole("menuitem")[1]);
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens the GitHub repository in a new tab from Star on GitHub", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<App />);
    fireEvent.click(within(openMenu()).getByRole("menuitem", { name: /Star on GitHub/ }));
    expect(open).toHaveBeenCalledWith("https://github.com/aswinmurali-io/promptdraw", "_blank", "noopener,noreferrer");
    expect(screen.queryByRole("menu")).toBeNull();
    open.mockRestore();
  });

  it("resets task, notes and toggles after confirmation", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Task"), { target: { value: "something" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Tests matter/ }));
    fireEvent.click(within(openMenu()).getByRole("menuitem", { name: /Reset/ }));
    const confirm = screen.getByRole("alertdialog", { name: "Reset" });
    expect(confirm).toHaveTextContent("Clear task, notes and all toggles?");
    fireEvent.click(within(confirm).getByRole("button", { name: "Reset" }));
    expect(screen.getByLabelText("Task")).toHaveValue("");
    expect(output()).not.toContain("**Tests matter**");
  });

  it("switches the theme on the root element", () => {
    render(<App />);
    fireEvent.click(within(openMenu()).getByRole("menuitemradio", { name: "Theme: Dark" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    fireEvent.click(within(openMenu()).getByRole("menuitemradio", { name: "Theme: System" }));
    expect(document.documentElement).not.toHaveAttribute("data-theme");
    fireEvent.keyDown(document.body, { key: "Î", code: "KeyD", altKey: true, shiftKey: true });
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });
});

describe("toolbar", () => {
  it("labels each tool in words, with its number key and a described tooltip", () => {
    render(<App />);
    const bar = screen.getByRole("toolbar", { name: "Modes and panels" });
    const task = within(bar).getByRole("button", { name: "Simple task" });
    const stages = within(bar).getByRole("button", { name: "Stages" });
    expect(task).toHaveAttribute("aria-pressed", "true");
    expect(stages).toHaveAttribute("data-tooltip", "Stages (2)\nBuild a multi-stage workflow on a canvas");
    expect(stages).toHaveTextContent("Stages2");
    expect(task.querySelector(".tool-label-wide")).toHaveTextContent("Simple task");
    expect(task.querySelector(".tool-label-phone")).toHaveTextContent("Task");
    expect(within(bar).getByRole("button", { name: "Settings panel" })).toHaveTextContent("Settings3");
    expect(within(bar).getByRole("button", { name: "Search (Command palette)" })).toHaveTextContent("Search");
    fireEvent.click(stages);
    expect(stages).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("main", { name: "Stages canvas" })).toBeInTheDocument();
  });

  it("hides and shows panels; on Simple task the Prompt panel takes How to work's place", () => {
    render(<App />);
    const bar = screen.getByRole("toolbar");
    const work = () => screen.queryByRole("complementary", { name: /How to work/ });
    const prompt = () => screen.queryByRole("complementary", { name: /Prompt/ });
    expect(work()).toBeInTheDocument();
    expect(prompt()).toBeNull();
    fireEvent.click(within(bar).getByRole("button", { name: "Prompt panel" }));
    expect(prompt()).toBeInTheDocument();
    expect(work()).toBeNull();
    fireEvent.keyDown(document.body, { key: "4" });
    expect(prompt()).toBeNull();
    expect(work()).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Settings" })).toBeNull();
    fireEvent.keyDown(document.body, { key: "3" });
    expect(screen.getByRole("complementary", { name: "Settings" })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "3" });
    expect(screen.queryByRole("complementary", { name: "Settings" })).toBeNull();
  });

  it("opens only the prompt panel on a first visit", () => {
    render(<App />);
    expect(screen.queryByRole("complementary", { name: "Settings" })).toBeNull();
    expect(screen.getByTestId("prompt-output")).toBeInTheDocument();
  });
});

describe("command palette", () => {
  it("opens with Ctrl+K, filters, and runs the chosen command with Enter", () => {
    render(<App />);
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
    const input = screen.getByRole("combobox", { name: "Search commands" });
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "tests matter" } });
    const first = within(screen.getByRole("listbox", { name: "Commands" })).getAllByRole("option")[0] as HTMLElement;
    expect(first).toHaveTextContent("Turn on: Tests matter");
    expect(first).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(output()).toContain("**Tests matter**");
  });

  it("opens with Ctrl+/ even from a text field and lists recent commands first", () => {
    render(<App />);
    fireEvent.keyDown(screen.getByLabelText("Task"), { key: "/", ctrlKey: true });
    fireEvent.change(screen.getByRole("combobox", { name: "Search commands" }), { target: { value: "stages" } });
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Search commands" }), { key: "Enter" });
    expect(screen.getByRole("main", { name: "Stages canvas" })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "/", ctrlKey: true });
    expect(screen.getByText("Recent")).toBeInTheDocument();
    expect(within(screen.getByRole("listbox", { name: "Commands" })).getAllByRole("option")[0]).toHaveTextContent("Stages");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Search commands" }), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("bottom controls", () => {
  it("greys out undo / redo until there is history", () => {
    render(<App />);
    const undo = screen.getByRole("button", { name: "Undo" });
    const redo = screen.getByRole("button", { name: "Redo" });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /UI intelligence/ }));
    expect(undo).toBeEnabled();
    fireEvent.click(undo);
    expect(output()).not.toContain("**UI intelligence**");
    expect(redo).toBeEnabled();
  });

  it("zooms the canvas and resets from the percentage", () => {
    render(<App />);
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    fireEvent.click(zoomIn);
    fireEvent.click(zoomIn);
    const pct = screen.getByRole("button", { name: /^Zoom 120%/ });
    expect(screen.getByTestId("task-world")).toHaveAttribute("data-zoom", "120");
    fireEvent.click(pct);
    expect(screen.getByRole("button", { name: /^Zoom 100%/ })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "-", ctrlKey: true });
    expect(screen.getByRole("button", { name: /^Zoom 90%/ })).toBeInTheDocument();
  });
});

describe("persistence", () => {
  it("autosaves after a debounce and restores on the next load", async () => {
    vi.useFakeTimers();
    const { unmount } = render(<App />);
    fireEvent.change(screen.getByLabelText("Task"), { target: { value: "remember me" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Basic code review/ }));
    expect(localStorage.getItem("promptdraw:task")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(localStorage.getItem("promptdraw:task")).toBe("remember me");
    expect(JSON.parse(localStorage.getItem("promptdraw:config") ?? "{}").toggles.review).toBe(true);
    unmount();
    vi.useRealTimers();
    render(<App />);
    expect(screen.getByLabelText("Task")).toHaveValue("remember me");
    expect(screen.getByRole("checkbox", { name: /Basic code review/ })).toBeChecked();
    expect(output()).toContain("**Basic code review**");
  });

  it("loads a Python app config already in storage", () => {
    localStorage.setItem("promptdraw:config", JSON.stringify({ extra: "\n", branch: "new", base: "12.41.0", worktree: "none", toggles: { unity_mcp: true }, mode: "dark" }));
    render(<App />);
    expect(output()).toContain("Create a new branch off `12.41.0`");
    expect(output()).toContain("**Nudge Unity CLI usage**");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("remembers hidden panels", () => {
    const { unmount } = render(<App />);
    fireEvent.keyDown(document.body, { key: "2" });
    fireEvent.keyDown(document.body, { key: "4" });
    unmount();
    render(<App />);
    expect(screen.queryByTestId("prompt-output")).toBeNull();
  });
});

describe("welcome hints", () => {
  it("shows on first load and goes away for good once a task is typed", () => {
    const { unmount } = render(<App />);
    expect(screen.getByRole("heading", { name: "promptdraw", level: 2 })).toBeInTheDocument();
    expect(document.querySelector(".welcome-arrows")).not.toBeNull();
    fireEvent.change(screen.getByLabelText("Task"), { target: { value: "x" } });
    expect(screen.queryByRole("heading", { name: "promptdraw", level: 2 })).toBeNull();
    fireEvent.change(screen.getByLabelText("Task"), { target: { value: "" } });
    expect(screen.queryByRole("heading", { name: "promptdraw", level: 2 })).toBeNull();
    unmount();
    render(<App />);
    expect(screen.queryByRole("heading", { name: "promptdraw", level: 2 })).toBeNull();
  });

  it("quick actions run registry commands and Got it dismisses", () => {
    render(<App />);
    const card = screen.getByRole("region", { name: "promptdraw" });
    fireEvent.click(within(card).getByRole("button", { name: /Keyboard shortcuts/ }));
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(within(card).getByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("region", { name: "promptdraw" })).toBeNull();
  });
});

describe("intro video", () => {
  it("opens once on a brand-new browser and stays closed after Start drawing", () => {
    localStorage.removeItem("promptdraw:intro");
    const { unmount } = render(<App />);
    const dialog = screen.getByRole("dialog", { name: "promptdraw in 30 seconds" });
    const video = dialog.querySelector("video");
    expect(video).not.toBeNull();
    expect(video!.getAttribute("src")).toMatch(/intro\.mp4$/);
    expect(video).toHaveAttribute("controls");
    expect(video!.muted).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Start drawing" }));
    expect(screen.queryByRole("dialog", { name: "promptdraw in 30 seconds" })).toBeNull();
    expect(localStorage.getItem("promptdraw:intro")).toBe("seen");
    // The welcome card is still there behind it.
    expect(screen.getByRole("region", { name: "promptdraw" })).toBeInTheDocument();
    unmount();
    render(<App />);
    expect(screen.queryByRole("dialog", { name: "promptdraw in 30 seconds" })).toBeNull();
  });

  it("skips returning visitors who already have saved prefs, and Escape also marks it seen", () => {
    localStorage.removeItem("promptdraw:intro");
    localStorage.setItem("promptdraw:prefs", JSON.stringify({ showProps: false, showOutput: true, zoom: 100, welcomeDismissed: true }));
    const { unmount } = render(<App />);
    expect(screen.queryByRole("dialog", { name: "promptdraw in 30 seconds" })).toBeNull();
    unmount();
    localStorage.clear();
    render(<App />);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "promptdraw in 30 seconds" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "promptdraw in 30 seconds" })).toBeNull();
    expect(localStorage.getItem("promptdraw:intro")).toBe("seen");
  });

  it("can be watched again from the menu", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Main menu" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Main menu" })).getByRole("menuitem", { name: /Watch the intro video/ }));
    expect(screen.getByRole("dialog", { name: "promptdraw in 30 seconds" })).toBeInTheDocument();
  });
});

describe("drag and drop", () => {
  it("loads a workflow YAML dropped on the canvas", async () => {
    render(<App />);
    const yaml = "name: dropped\ngoal: Ship it\nblocks:\n  - id: b1\n    type: stage\n    name: Build\n    prompt: build it\n";
    const file = new File([yaml], "dropped.yaml", { type: "text/yaml" });
    await act(async () => {
      fireEvent.drop(screen.getByRole("main"), { dataTransfer: { files: [file], types: ["Files"] } });
    });
    await waitFor(() => expect(output()).toContain("**Goal:** Ship it"));
    expect(output()).toContain("1. **Build** — build it");
    expect(screen.getByRole("main", { name: "Stages canvas" })).toBeInTheDocument();
    expect(screen.getByTestId("stage-surface")).toHaveTextContent("Build");
  });
});

describe("workflow links", () => {
  const sprintGoal = "**Goal:** Burn down this sprint";
  const sprintLink = async () => "#wf=" + (await encodePayload(toYaml(new Workflow(starterWorkflow("sprint-chaser")!))));
  const seedUnsaved = () => {
    localStorage.setItem("promptdraw:config", serializeAppConfig({ ...appDefaults(), tab: "stages", workflow: sample().toDict() }));
    localStorage.setItem("promptdraw:prefs", JSON.stringify({ showProps: true, showOutput: true, zoom: 100, welcomeDismissed: true }));
  };

  afterEach(() => history.replaceState(null, "", location.pathname));

  // @lat: [[ui#Tests#Workflow links open on Stages]]
  it("opens a #wf= link on the Stages tab and clears the hash", async () => {
    history.replaceState(null, "", location.pathname + (await sprintLink()));
    render(<App />);
    await waitFor(() => expect(output()).toContain(sprintGoal));
    expect(screen.getByRole("main", { name: "Stages canvas" })).toBeInTheDocument();
    expect(screen.getByText("Loaded sprint-chaser from link")).toBeInTheDocument();
    expect(location.hash).toBe("");
  });

  // @lat: [[ui#Tests#Workflow links ask before replacing unsaved edits]]
  it("asks before replacing unsaved stage edits", async () => {
    seedUnsaved();
    render(<App />);
    const link = await sprintLink();
    await act(async () => {
      history.replaceState(null, "", location.pathname + link);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    const dlg = await screen.findByRole("alertdialog", { name: "Unsaved changes" });
    fireEvent.click(within(dlg).getByRole("button", { name: "Cancel" }));
    expect(output()).toContain("**Goal:** Match the Shop screen");
    expect(location.hash).toBe("");
  });

  it("opens a second link pasted into an open tab", async () => {
    render(<App />);
    const link = await sprintLink();
    await act(async () => {
      history.replaceState(null, "", location.pathname + link);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await waitFor(() => expect(output()).toContain(sprintGoal));
  });

  // @lat: [[ui#Tests#Broken workflow links change nothing]]
  it("reports a broken link and changes nothing", async () => {
    history.replaceState(null, "", location.pathname + "#wf=!!!");
    render(<App />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/^Couldn't load workflow from link:/));
    expect(screen.getByRole("main", { name: "Task prompt canvas" })).toBeInTheDocument();
    expect(location.hash).toBe("");
  });
});
