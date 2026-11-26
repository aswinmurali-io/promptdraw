// Stage editor interactions, driven through the whole app: every edit must reach the
// compiled prompt exactly as the Python app's StageBuilder would produce it.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SIDE_W, Workflow, appDefaults, appState, buildPrompt, serializeAppConfig, workflowPrompt, type WorkflowDict } from "../../core";
import { sample } from "../../test/fixtures";
import { App } from "../App";
import { DOCK_MIN, clampWidth } from "./dock";
import { listLibrary } from "./library";
import { buildScene } from "./scene";
import { starterWorkflow } from "./starters";
import { toScreen, type Viewport } from "./viewport";

function output(): string {
  return screen.getByTestId("prompt-output").textContent ?? "";
}

function seed(workflow: WorkflowDict) {
  const cfg = { ...appDefaults(), tab: "stages" as const, workflow };
  localStorage.setItem("promptdraw:config", serializeAppConfig(cfg));
  localStorage.setItem("promptdraw:prefs", JSON.stringify({ showProps: true, showPrompt: true, zoom: 100, welcomeDismissed: true }));
}

function card(key: string): Element {
  const el = screen.getByTestId("stage-surface").querySelector(`[data-hit="node"][data-key="${key}"]`);
  if (!el) throw new Error(`no card ${key}`);
  return el;
}

/** The current viewport, read back from the SVG transform. */
function view(): Viewport {
  const g = screen.getByTestId("stage-surface").querySelector("svg > g");
  const m = /scale\(([-\d.e]+)\) translate\(([-\d.e]+) ([-\d.e]+)\)/.exec(g?.getAttribute("transform") ?? "");
  if (!m) throw new Error("no transform");
  return { zoom: Number(m[1]), scrollX: Number(m[2]), scrollY: Number(m[3]) };
}

function click(el: Element, opts: { shiftKey?: boolean; x?: number; y?: number } = {}) {
  const o = { pointerId: 1, button: 0, clientX: opts.x ?? 10, clientY: opts.y ?? 10, shiftKey: opts.shiftKey };
  fireEvent.pointerDown(el, o);
  fireEvent.pointerUp(el, o);
}

function press(key: string, init: KeyboardEventInit = {}) {
  fireEvent.keyDown(document.body, { key, ...init });
}

const stagesPrompt = (wf: WorkflowDict) => buildPrompt({ ...appState(appDefaults()), tab: "stages", workflow: wf })[0];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("promptdraw:promptView", "markdown");
  localStorage.setItem("promptdraw:intro", "seen");
  // These tests read the compiled prompt: a returning user with the Stages Prompt panel shown.
  localStorage.setItem("promptdraw:prefs", JSON.stringify({ showPrompt: true }));
  Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
});

afterEach(() => {
  localStorage.clear();
});

describe("stage canvas", () => {
  // @lat: [[stages#Stage editor#Tests#Inspector docks right and folds away]]
  it("docks the inspector on the right in the Prompt panel's place and folds it on a click elsewhere", () => {
    seed(sample().toDict());
    render(<App />);
    click(card("goal"));
    const panel = document.querySelector("aside.inspector");
    expect(panel?.getAttribute("data-inset")).toBe("right");
    expect(screen.getByTestId("prompt-output").closest("aside")?.hidden).toBe(true);
    expect(screen.getByRole("radiogroup", { name: /show the goal as/i })).toBeTruthy();
    // The zoom row and the canvas keep it open; anything else folds it away.
    fireEvent.pointerDown(document.querySelector(".region--bottom-left button")!);
    expect(document.querySelector("aside.inspector")).not.toBeNull();
    fireEvent.pointerDown(document.querySelector(".region--top-center button")!);
    expect(document.querySelector("aside.inspector")).toBeNull();
    expect(screen.getByTestId("prompt-output").closest("aside")?.hidden).toBe(false);
  });

  // @lat: [[stages#Stage editor#Tests#Escape leaves a field then closes the inspector]]
  it("Escape in an inspector field leaves the field; the next Escape closes the inspector", () => {
    seed(sample().toDict());
    render(<App />);
    click(card("goal"));
    const field = document.querySelector<HTMLElement>("aside.inspector textarea")!;
    field.focus();
    fireEvent.keyDown(field, { key: "Escape" });
    expect(document.activeElement).not.toBe(field);
    expect(document.querySelector("aside.inspector")).not.toBeNull();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(document.querySelector("aside.inspector")).toBeNull();
  });

  // @lat: [[stages#Stage editor#Tests#Inspector width and name row]]
  it("opens the inspector at 40% of the window until resized and puts Model and Read-only beside the name", () => {
    expect(clampWidth(SIDE_W, 1600)).toBe(640);
    expect(clampWidth(SIDE_W, 1000)).toBe(DOCK_MIN);
    expect(clampWidth(520, 1600)).toBe(520);
    render(<App />);
    press("2");
    press("s");
    const inspector = screen.getByRole("complementary", { name: /^Stage \d/ });
    const row = within(inspector).getByLabelText("Stage name").closest(".insp-name-row") as HTMLElement;
    expect(within(row).getByLabelText("Model hint")).toBeTruthy();
    const ro = within(row).getByRole("checkbox", { name: "Read-only" });
    fireEvent.click(ro);
    expect(output()).toMatch(/read-only/i);
  });

  // @lat: [[stages#Stage editor#Tests#Dictation into a prompt]]
  it("dictates into a stage prompt at the caret, showing what is still being heard", () => {
    type Handler = ((e: unknown) => void) | null;
    const made: { onresult: Handler; onend: (() => void) | null; start: () => void; stop: () => void }[] = [];
    class FakeRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      onresult: Handler = null;
      onerror: Handler = null;
      onend: (() => void) | null = null;
      constructor() {
        made.push(this);
      }
      start() {}
      stop() {
        this.onend?.();
      }
      abort() {}
    }
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
    try {
      render(<App />);
      press("2");
      press("s");
      const inspector = screen.getByRole("complementary", { name: /^Stage \d/ });
      const area = within(inspector).getByLabelText("Prompt description") as HTMLTextAreaElement;
      fireEvent.change(area, { target: { value: "build it" } });
      area.setSelectionRange(5, 5);
      const mic = within(inspector).getByRole("button", { name: "Dictate into prompt description" });
      fireEvent.click(mic);
      const rec = made[0]!;
      expect(within(inspector).getByRole("button", { name: "Stop dictating into prompt description" })).toHaveAttribute("aria-pressed", "true");
      const said = (transcript: string, isFinal: boolean) => Object.assign([{ transcript }], { isFinal });
      act(() => rec.onresult?.({ resultIndex: 0, results: [said("the whole", false)] }));
      expect(within(inspector).getByText("the whole")).toBeInTheDocument();
      act(() => rec.onresult?.({ resultIndex: 0, results: [said(" the whole app", true)] }));
      expect(area.value).toBe("build the whole app it");
      fireEvent.click(within(inspector).getByRole("button", { name: "Stop dictating into prompt description" }));
      expect(within(inspector).getByRole("button", { name: "Dictate into prompt description" })).toHaveAttribute("aria-pressed", "false");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // @lat: [[stages#Stage editor#Tests#Card notes on an empty workflow]]
  it("explains the Goal and on-cancel cards on an empty workflow, until there is a block", () => {
    render(<App />);
    press("2");
    expect(screen.getByTestId("goal-note")).toHaveTextContent("The goal: what “done” looks like");
    expect(screen.getByTestId("cancel-note")).toHaveTextContent("Runs only if you cancel the run");
    press("s");
    expect(screen.queryByTestId("goal-note")).toBeNull();
    expect(screen.queryByTestId("cancel-note")).toBeNull();
  });

  it("draws every block, numbered like the Python app", () => {
    seed(sample().toDict());
    render(<App />);
    const surface = screen.getByTestId("stage-surface");
    for (const k of ["goal", "b1", "b2", "b3", "b4", "b5", "b6", "b7", "on_cancel"]) expect(card(k)).toBeInTheDocument();
    expect(within(surface as HTMLElement).getByText("STAGE 1A")).toBeInTheDocument();
    expect(within(surface as HTMLElement).getByText("⇉ parallel · wait for all")).toBeInTheDocument();
    expect(output()).toBe(stagesPrompt(sample().toDict()));
  });

  it("adds a stage with S, edits it in the inspector, and the prompt follows", () => {
    render(<App />);
    press("2");
    expect(screen.getByRole("main", { name: "Stages canvas" })).toBeInTheDocument();
    press("s");
    const inspector = screen.getByRole("complementary", { name: /^Stage \d/ });
    fireEvent.change(within(inspector).getAllByRole("textbox")[0] as HTMLElement, { target: { value: "Build" } });
    fireEvent.change(within(inspector).getByLabelText("Prompt description"), { target: { value: "build it" } });
    expect(output()).toContain("1. **Build** — build it");
    fireEvent.change(within(inspector).getByDisplayValue("none"), { target: { value: "opus" } });
    expect(output()).toContain("1. **Build** (run on the `opus` model, in a subagent if needed) — build it");
  });

  it("highlights calls in stage text, and Backspace after a call removes all of it", () => {
    render(<App />);
    press("2");
    press("s");
    const inspector = screen.getByRole("complementary", { name: /^Stage \d/ });
    const box = within(inspector).getByLabelText("Prompt description") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Run [[Critique: take = A]] on {{SCREEN}} **now**" } });
    const mirror = box.parentElement!.querySelector(".hl-mirror")!;
    expect(mirror.querySelector(".hl-call")).toHaveTextContent("[[Critique: take = A]]");
    expect(mirror.querySelector(".hl-fill")).toHaveTextContent("{{SCREEN}}");
    expect(mirror.querySelector(".hl-bold")).toHaveTextContent("now");
    box.setSelectionRange(26, 26);
    fireEvent.keyDown(box, { key: "Backspace" });
    expect(box.value).toBe("Run  on {{SCREEN}} **now**");
    expect(box.selectionStart).toBe(4);
  });

  it("marks Markdown code in a stage prompt, previews it, and edits it in the large editor", () => {
    render(<App />);
    press("2");
    press("s");
    const inspector = screen.getByRole("complementary", { name: /^Stage \d/ });
    fireEvent.change(within(inspector).getAllByRole("textbox")[0] as HTMLElement, { target: { value: "Check" } });
    const text = "Run `npm test` first\n```\nnpm run build\n```";
    fireEvent.change(within(inspector).getByLabelText("Prompt description"), { target: { value: text } });
    const mirror = inspector.querySelector(".hl-mirror")!;
    expect(mirror.querySelector(".hl-code")).toHaveTextContent("`npm test`");
    expect(mirror.querySelector(".hl-fence")).toHaveTextContent("npm run build");

    fireEvent.click(within(inspector).getByRole("radio", { name: "Preview" }));
    expect(within(inspector).queryByLabelText("Prompt description", { selector: "textarea" })).toBeNull();
    expect(inspector.querySelector(".md-preview code.md-code")).toHaveTextContent(/^npm test$/);
    expect(inspector.querySelector(".md-preview pre")).toHaveTextContent("npm run build");

    fireEvent.click(within(inspector).getByRole("button", { name: "Expand prompt description" }));
    const editor = screen.getByRole("dialog", { name: "Stage 1 · Check" });
    // It opens in the view the field was in; Split shows the editor beside the preview.
    expect(within(editor).getByRole("radio", { name: "Preview" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(editor).getByRole("radio", { name: "Split" }));
    expect(editor.querySelector(".pe-read .md-preview pre")).toHaveTextContent("npm run build");
    const big = within(editor).getByLabelText("Prompt description") as HTMLTextAreaElement;
    expect(big.value).toBe(text);
    fireEvent.change(big, { target: { value: text + "\nthen ship" } });
    expect(output()).toContain("then ship");
    fireEvent.click(within(editor).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(inspector.querySelector(".md-preview")).toHaveTextContent("then ship");
  });

  it("arrow keys walk the blocks from the keyboard, announce them, and Delete removes one", () => {
    seed(sample().toDict());
    render(<App />);
    const surface = screen.getByTestId("stage-surface");
    act(() => surface.focus());
    fireEvent.keyDown(surface, { key: "Home" });
    expect(screen.getByRole("complementary", { name: "Goal" })).toBeInTheDocument();
    expect(screen.getByTestId("stage-announce")).toHaveTextContent("Goal: Match the Shop screen to shop_ref.png");
    fireEvent.keyDown(surface, { key: "ArrowRight" });
    expect(screen.getByTestId("stage-announce")).toHaveTextContent(/^Stage 1a: Recon$/);
    fireEvent.keyDown(surface, { key: "ArrowDown" });
    fireEvent.keyDown(surface, { key: "ArrowRight" });
    fireEvent.keyDown(surface, { key: "ArrowRight" });
    expect(screen.getByTestId("stage-announce")).toHaveTextContent("Stage 2: Implement");
    fireEvent.keyDown(surface, { key: "Delete" });
    expect(output()).not.toContain("**Implement**");
  });

  it("undo and redo cover canvas edits", () => {
    seed(sample().toDict());
    render(<App />);
    click(card("b7"));
    act(() => (screen.getByTestId("stage-surface") as HTMLElement).focus());
    press("Delete");
    expect(output()).not.toContain("**Review**");
    press("z", { ctrlKey: true, metaKey: true });
    expect(output()).toContain("5. **Review** — review");
  });

  it("clicking a card focuses it; shift-click and tick boxes select; L makes a loop", () => {
    seed(sample().toDict());
    render(<App />);
    click(card("b4"));
    expect(screen.getByRole("complementary", { name: /^Stage \d/ })).toHaveTextContent("Stage 2");
    // A click focuses only: nothing is ticked, so Loop and Parallel stay off.
    expect(screen.getByTestId("stage-surface").querySelectorAll('[data-hit="tick"][aria-checked="true"]')).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Loop selected blocks" })).toHaveAttribute("aria-disabled", "true");
    click(card("b4"), { shiftKey: true });
    click(card("b7"), { shiftKey: true });
    expect(screen.getByText(/· Parallel stages must sit next to each other\.$/)).toBeInTheDocument();
    click(card("b7"), { shiftKey: true });
    expect(screen.getByText("1 stage selected · press L to loop · tick another to run them in parallel")).toBeInTheDocument();
    press("l");
    expect(within(screen.getByRole("complementary", { name: "Loop" })).getByTestId("inspector-subtitle")).toHaveTextContent("Implement");
    expect(output()).toContain("Loop stage 2 (Implement) as an agentic loop: run it exactly 3 times");
  });

  it("drags a card onto the first gap to move it to the front", () => {
    seed(sample().toDict());
    render(<App />);
    const v = view();
    const { L } = buildScene(sample().toDict());
    const gap = L.links[0]!;
    const [gx, gy] = toScreen(v, gap.cx, gap.cy);
    const el = card("b7");
    const [sx, sy] = toScreen(v, ...((L.cards.get("b7")!.slice(0, 2) as [number, number]).map((n) => n + 30) as [number, number]));
    fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: sx, clientY: sy });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: sx - 40, clientY: sy });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: gx, clientY: gy });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: gx, clientY: gy });
    const expected = sample();
    expected.moveTo("b7", 0, null);
    expect(output()).toContain(workflowPrompt(expected));
    expect(output()).toContain("1. **Review** — review");
  });

  it("the + gap opens the add menu; a template is inserted there", () => {
    seed(sample().toDict());
    render(<App />);
    const plus = screen.getByTestId("stage-surface").querySelector('[data-hit="plus"][data-key="0"]')!;
    click(plus);
    const menu = screen.getByRole("menu", { name: "Add block" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Code review/ }));
    const wf = sample();
    wf.insert(0, "stage", null, "code_review");
    expect(output()).toBe(stagesPrompt(wf.toDict()));
  });

  it("Escape in a canvas menu closes only the menu, keeping the selection", () => {
    seed(sample().toDict());
    render(<App />);
    click(card("b4"), { shiftKey: true });
    click(card("b7"), { shiftKey: true });
    const hint = /· Parallel stages must sit next to each other\.$/;
    expect(screen.getByText(hint)).toBeInTheDocument();
    fireEvent.contextMenu(card("b7"), { clientX: 50, clientY: 50 });
    const menu = screen.getByRole("menu", { name: "Canvas menu" });
    fireEvent.keyDown(document.activeElement ?? menu, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Canvas menu" })).toBeNull();
    expect(screen.getByText(hint)).toBeInTheDocument();
  });

  it("right-click a card offers Delete", () => {
    seed(sample().toDict());
    render(<App />);
    fireEvent.contextMenu(card("b3"), { clientX: 50, clientY: 50 });
    fireEvent.click(within(screen.getByRole("menu", { name: "Canvas menu" })).getByRole("menuitem", { name: /Delete/ }));
    expect(output()).not.toContain("**Note:**");
  });

  it("Ctrl/Cmd + wheel zooms toward the cursor and the zoom island follows", () => {
    seed(sample().toDict());
    render(<App />);
    const before = view().zoom;
    fireEvent.wheel(screen.getByTestId("stage-surface"), { deltaY: -100, ctrlKey: true, metaKey: true, clientX: 300, clientY: 200 });
    expect(view().zoom).toBeGreaterThan(before);
    expect(screen.getByRole("button", { name: /^Zoom \d+%/ })).toHaveTextContent(`${Math.round(view().zoom * 100)}%`);
    fireEvent.wheel(screen.getByTestId("stage-surface"), { deltaX: 0, deltaY: 50 });
    expect(view().zoom).toBeGreaterThan(before);
  });

  it("two-finger pinch zooms the canvas and never clicks", () => {
    seed(sample().toDict());
    render(<App />);
    const surface = screen.getByTestId("stage-surface");
    const before = view().zoom;
    const el = card("b4");
    fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: 100, clientY: 100, pointerType: "touch" });
    fireEvent.pointerDown(surface, { pointerId: 2, button: 0, clientX: 200, clientY: 100, pointerType: "touch" });
    fireEvent.pointerMove(surface, { pointerId: 2, clientX: 300, clientY: 100, pointerType: "touch" });
    expect(view().zoom).toBeCloseTo(Math.min(3, before * 2));
    fireEvent.pointerUp(surface, { pointerId: 2, clientX: 300, clientY: 100, pointerType: "touch" });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 100, clientY: 100, pointerType: "touch" });
    expect(screen.queryByRole("complementary", { name: /^Stage \d/ })).toBeNull();
  });

  it("saves to the browser library, starts a new workflow, and loads it back", async () => {
    seed(sample().toDict());
    render(<App />);
    expect(screen.getByText("● unsaved changes")).toBeInTheDocument();
    const fileMenu = () => {
      fireEvent.click(screen.getByRole("button", { name: "Workflow file" }));
      return within(screen.getByRole("menu", { name: "Workflow file" }));
    };
    fireEvent.click(fileMenu().getByRole("menuitem", { name: /^Save/ }));
    expect(screen.getByText(/^Saved workflows\/shop_screen_polish\.yaml at \d\d:\d\d$/)).toBeInTheDocument();
    fireEvent.click(fileMenu().getByRole("menuitem", { name: /^New workflow/ }));
    await waitFor(() => expect(screen.getByLabelText("Workflow name")).toHaveValue("untitled"));
    expect(output()).toContain("**Goal:** <describe the goal here>");
    fireEvent.click(fileMenu().getByRole("menuitem", { name: /shop_screen_polish\.yaml/ }));
    expect(output()).toBe(stagesPrompt(new Workflow(sample().toDict()).toDict()));
  });

  // @lat: [[stages#Stage editor#Tests#Templates open from the file menu]]
  it("opens a starter template from the file menu, unsaved, under its own name", async () => {
    seed(new Workflow({ name: "untitled" }).toDict());
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Workflow file" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Workflow file" })).getByRole("menuitem", { name: /^Council of QC UI/ }));
    await waitFor(() => expect(screen.getByLabelText("Workflow name")).toHaveValue("council-of-qc-ui"));
    expect(output()).toBe(stagesPrompt(starterWorkflow("council-of-qc-ui")!));
    expect(screen.getByText("Opened the Council of QC UI template")).toBeInTheDocument();
    expect(listLibrary()).toEqual([]);
  });

  // @lat: [[stages#Stage editor#Tests#Loading shows the whole flow first]]
  it("opens a loaded workflow on the whole flow, then glides into the opening view", async () => {
    const realMatch = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    try {
      seed(sample().toDict());
      render(<App />);
      const fileMenu = () => {
        fireEvent.click(screen.getByRole("button", { name: "Workflow file" }));
        return within(screen.getByRole("menu", { name: "Workflow file" }));
      };
      fireEvent.click(fileMenu().getByRole("menuitem", { name: /^Save/ }));
      const home = view();
      fireEvent.click(fileMenu().getByRole("menuitem", { name: /^New workflow/ }));
      await waitFor(() => expect(screen.getByLabelText("Workflow name")).toHaveValue("untitled"));
      fireEvent.click(fileMenu().getByRole("menuitem", { name: /shop_screen_polish\.yaml/ }));
      const overview = view();
      expect(overview.zoom).toBeLessThan(home.zoom * 0.9);
      await waitFor(() => expect(view()).toEqual(home), { timeout: 3000 });
    } finally {
      window.matchMedia = realMatch;
    }
  });

  it("Ctrl/Cmd+S saves the workflow on the Stages tab, not the settings", () => {
    seed(sample().toDict());
    const createObjectURL = vi.fn(() => "blob:x");
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    render(<App />);
    press("s", { ctrlKey: true, metaKey: true });
    expect(screen.getByText(/^Saved workflows\/shop_screen_polish\.yaml at \d\d:\d\d$/)).toBeInTheDocument();
    expect(createObjectURL).not.toHaveBeenCalled();
    press("s", { ctrlKey: true, metaKey: true, altKey: true, code: "KeyS" } as KeyboardEventInit);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("asks before discarding unsaved changes", () => {
    seed(sample().toDict());
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Workflow file" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Workflow file" })).getByRole("menuitem", { name: /^New workflow/ }));
    const dlg = screen.getByRole("alertdialog", { name: "Unsaved changes" });
    expect(dlg).toHaveTextContent("Discard unsaved changes to 'shop_screen_polish'?");
    fireEvent.click(within(dlg).getByRole("button", { name: "Cancel" }));
    expect(output()).toContain("**Goal:** Match the Shop screen");
  });

  it("asks before a settings JSON replaces an unsaved workflow", async () => {
    seed(sample().toDict());
    render(<App />);
    const json = serializeAppConfig({ ...appDefaults(), tab: "stages", workflow: new Workflow({ name: "other", goal: "Other goal" }).toDict() });
    const file = new File([json], "prompt_builder.json", { type: "application/json" });
    await act(async () => {
      fireEvent.change(screen.getByTestId("file-input"), { target: { files: [file] } });
    });
    const dlg = await screen.findByRole("alertdialog", { name: "Unsaved changes" });
    fireEvent.click(within(dlg).getByRole("button", { name: "Cancel" }));
    expect(output()).toContain("**Goal:** Match the Shop screen");
    await act(async () => {
      fireEvent.change(screen.getByTestId("file-input"), { target: { files: [file] } });
    });
    fireEvent.click(within(await screen.findByRole("alertdialog", { name: "Unsaved changes" })).getByRole("button", { name: "Discard" }));
    expect(output()).toContain("**Goal:** Other goal");
    // What the file brought in is the baseline: nothing is unsaved until it is edited.
    expect(screen.queryByText("● unsaved changes")).toBeNull();
  });

  it("an untouched new workflow has no unsaved changes", () => {
    seed(new Workflow({ name: "untitled" }).toDict());
    render(<App />);
    expect(screen.queryByText(/unsaved changes/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add stage" }));
    expect(screen.getByText("● unsaved changes")).toBeInTheDocument();
  });
});
