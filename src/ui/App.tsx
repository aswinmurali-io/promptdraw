// @lat: [[architecture#Data flow]]
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { appState, buildPrompt, copyText, type ToggleKey, type WorkflowDict } from "../core";
import { buildActions, handleShortcut, type ActionContext } from "./actions";
import { BottomControls } from "./components/BottomControls";
import { CommandPalette } from "./components/CommandPalette";
import { ConfirmDialog, Dialog } from "./components/Dialog";
import { GitHubRibbon } from "./components/GitHubRibbon";
import { Icon } from "./components/Icon";
import { MainMenu } from "./components/MainMenu";
import { OptionLanes } from "./components/OptionLanes";
import { OutputPanel } from "./components/OutputPanel";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { WorkspaceSettings } from "./components/WorkspaceSettings";
import { ShortcutsDialog } from "./components/ShortcutsDialog";
import { StagesMount } from "./components/StagesMount";
import { Inspector } from "./stages/Inspector";
import { StageBar, WorkflowIsland } from "./stages/StageBar";
import { addMenuItems, contextMenuItems } from "./stages/menus";
import { PopMenu } from "./components/PopMenu";
import { TaskBoard } from "./components/TaskBoard";
import { TaskCanvas } from "./components/TaskCanvas";
import { WorkPanel } from "./components/WorkPanel";
import { DemoPanel } from "./stages/DemoPanel";
import { Toast, type ToastMessage } from "./components/Toast";
import { Toolbar } from "./components/Toolbar";
import { WelcomeArrows, WelcomeCard } from "./components/WelcomeHints";
import { boardArea, boardZoom } from "./lib/board";
import { writeClipboard } from "./lib/clipboard";
import { useChasedView } from "./lib/useChasedView";
import { CONFIG_FILE, OPEN_ACCEPT, configJson, downloadText, importFile, importText, workflowYaml, type ImportResult } from "./lib/files";
import { decodePayload, LinkError, parseLinkHash } from "./lib/link";

/** The name a workflow link loads under (YAML, so it opens as a workflow). */
const LINK_FILE = "link.yaml";
import { applyTheme, nextTheme } from "./lib/theme";
import { hasPrefs, introDue, loadPrefs, loadStored, markIntroSeen, savePrefs, useAutosave, type Prefs } from "./state/persistence";
import { IntroDialog } from "./components/IntroDialog";
import { isTyping } from "./lib/keys";
import { useStore, type WorkspaceKey } from "./state/store";
import { useStages, type ConfirmRequest } from "./stages/useStages";
import { gapsLabel, promptGaps, type PromptGap } from "./lib/gaps";
import { ZOOM_MAX as STAGE_ZOOM_MAX, ZOOM_MIN as STAGE_ZOOM_MIN, stepZoom, zoomAt } from "./stages/viewport";
import "./styles/shell.css";
import "./styles/motion.css";
import { DUR, EXIT, POP_OUT, enter, morphPanel, rightPanel, useExitGhost, useMotionReady } from "./lib/motion";

/** The Python app keeps "copied to clipboard" in the meta line for 1.6 s. */
const COPIED_MS = 1600;

/** Matches the CSS breakpoint where panels stop pushing the canvas and float over it. */
function narrow(): boolean {
  return typeof matchMedia === "function" && matchMedia("(max-width: 900px)").matches;
}

type DialogState =
  | null
  | { kind: "shortcuts" }
  | { kind: "intro" }
  | { kind: "palette" }
  | { kind: "reset" }
  | { kind: "warnings"; title: string; items: string[] }
  | ({ kind: "confirm" } & ConfirmRequest)
  | { kind: "gaps"; gaps: PromptGap[] };

export function App() {
  const { state, dispatch, set } = useStore(loadStored);
  const { cfg } = state;
  const taskRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [prefs, setPrefs] = useState<Prefs>(() => {
    const p = loadPrefs();
    // On a phone a panel is a sheet over the canvas: the first visit opens none, later ones one.
    if (narrow() && !hasPrefs()) return { ...p, showProps: false, showOutput: false };
    return p.showProps && p.showOutput && narrow() ? { ...p, showProps: false } : p;
  });
  const { showProps, showOutput, zoom } = prefs;
  useMotionReady();
  // Switching tabs: the new canvas fades in.
  const canvasRef = useRef<HTMLElement>(null);
  const firstTab = useRef(true);
  useLayoutEffect(() => {
    if (firstTab.current) {
      firstTab.current = false;
      return;
    }
    enter(canvasRef.current, [{ opacity: 0 }, { opacity: 1 }], DUR[2]);
  }, [cfg.tab]);
  // ...and the right-hand panel moves from where it stood on the old tab to where it stands now.
  const lastPanel = useRef<{ tab: string; rect: DOMRect; radius: string } | null>(null);
  useLayoutEffect(() => {
    const el = rightPanel();
    const prev = lastPanel.current;
    if (prev && prev.tab !== cfg.tab) morphPanel(prev, el);
    lastPanel.current = el ? { tab: cfg.tab, rect: el.getBoundingClientRect(), radius: getComputedStyle(el).borderRadius } : null;
  });
  const patchPrefs = useCallback((p: Partial<Prefs> | ((cur: Prefs) => Partial<Prefs>)) => setPrefs((cur) => ({ ...cur, ...(typeof p === "function" ? p(cur) : p) })), []);
  // Open (never toggle) a side panel; on narrow screens one panel at a time, as a sheet.
  // On the Simple task tab the right edge belongs to How to work; the Prompt panel takes it over
  // only when asked for there (Prompt in the toolbar, the board's Prompt node), and hands it back
  // when closed. Stages keeps the remembered Prompt panel as before.
  const [taskPrompt, setTaskPrompt] = useState(false);
  const showPromptPanel = useCallback(() => {
    setTaskPrompt(true);
    patchPrefs(() => (narrow() ? { showOutput: true, showProps: false } : { showOutput: true }));
  }, [patchPrefs]);
  const onToggle = useCallback((key: ToggleKey, on: boolean) => dispatch({ type: "toggle", key, on }), [dispatch]);
  const [copied, setCopied] = useState(false);
  // An empty task or goal is a quiet "to do" note until you try to copy with it still empty;
  // then (for the rest of the session) it turns into the amber warning. A first visit never
  // opens on an error-coloured banner for something not yet attempted.
  const [gapsWarned, setGapsWarned] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  // A brand-new browser opens on the intro video (decided before the first prefs save).
  const [dialog, setDialog] = useState<DialogState>(() => (introDue() ? { kind: "intro" } : null));
  const [dragging, setDragging] = useState(false);
  // The Task board's pan and zoom. Only the zoom is remembered (as a percentage in prefs).
  const [taskView, setTaskView] = useChasedView(() => ({ scrollX: 0, scrollY: 0, zoom: boardZoom(zoom / 100) }));
  const taskZoom = Math.round(taskView.zoom * 100);
  useEffect(() => patchPrefs((p) => (p.zoom === taskZoom ? {} : { zoom: taskZoom })), [taskZoom, patchPrefs]);
  const stepTaskZoom = (dir: 1 | -1) =>
    setTaskView((v) => {
      const a = boardArea(document.querySelector<HTMLElement>(".task-world"));
      return zoomAt(v, boardZoom(stepZoom(v.zoom, dir)), a.left + a.width / 2, a.top + a.height / 2);
    });

  // Fit: zoom the board so the whole flow shows, centred in the free canvas (never above 100%).
  const fitTask = () =>
    setTaskView((v) => {
      const world = document.querySelector<HTMLElement>(".task-world");
      const flow = world?.querySelector<HTMLElement>(".task-canvas");
      if (!world || !flow) return v;
      // The flow's place in the board, unzoomed: both rects carry the same scale and pan.
      const wr = world.getBoundingClientRect();
      const fr = flow.getBoundingClientRect();
      const ox = (fr.left - wr.left) / v.zoom - v.scrollX;
      const oy = (fr.top - wr.top) / v.zoom - v.scrollY;
      const a = boardArea(world);
      const w = fr.width / v.zoom;
      const h = fr.height / v.zoom;
      const zoom = boardZoom(Math.min(1, (a.width / w) * 0.94, (a.height / h) * 0.94));
      // Centred; a flow still too big at the smallest zoom starts at the free area's top-left.
      const x = a.left + Math.max(0, (a.width - zoom * w) / 2);
      const y = a.top + Math.max(0, (a.height - zoom * h) / 2);
      return { zoom, scrollX: x / zoom - ox, scrollY: y / zoom - oy };
    });

  useEffect(() => applyTheme(cfg.mode), [cfg.mode]);
  useEffect(() => savePrefs(prefs), [prefs]);
  useAutosave(cfg, (next) => dispatch({ type: "external", cfg: next }));

  // The welcome goes away for good once a task exists (like the first element on a whiteboard).
  const hasTask = cfg.task.trim() !== "";
  useEffect(() => {
    if (hasTask) patchPrefs((p) => (p.welcomeDismissed ? {} : { welcomeDismissed: true }));
  }, [hasTask, patchPrefs]);
  const welcome = !prefs.welcomeDismissed && cfg.tab === "task" && !hasTask;

  // Compile from a deferred copy so typing stays responsive on big workflows; React catches
  // the prompt up as soon as the input is idle.
  const deferredCfg = useDeferredValue(cfg);
  const promptState = useMemo(() => appState(deferredCfg), [deferredCfg]);
  const compiled = useMemo((): { prompt: string; sections: string[]; error: string | null } => {
    try {
      const [prompt, sections] = buildPrompt(promptState);
      return { prompt, sections, error: null };
    } catch (e) {
      return { prompt: "", sections: [], error: `Couldn't build the prompt: ${(e as Error).message}` };
    }
  }, [promptState]);

  // Hand edits to the prompt box (the Python app's output box is editable too). They belong to one
  // compiled prompt: once the inputs change, the box shows the new compiled text again.
  const [edit, setEdit] = useState<{ base: string; text: string } | null>(null);
  const shownPrompt = edit && edit.base === compiled.prompt ? edit.text : compiled.prompt;
  const editPrompt = useCallback((text: string) => setEdit({ base: compiled.prompt, text }), [compiled.prompt]);
  const revertPrompt = useCallback(() => setEdit(null), []);

  // What Copy / Export take: the box, unless the deferred compile is still catching up with
  // the latest input, in which case compile that input now.
  const latestPrompt = useCallback((): string => {
    if (deferredCfg === cfg) return shownPrompt;
    try {
      return buildPrompt(appState(cfg))[0];
    } catch {
      return "";
    }
  }, [cfg, deferredCfg, shownPrompt]);

  const notify = useCallback((text: string, tone: ToastMessage["tone"] = "info", quiet = false) => setToast({ id: Date.now(), text, tone, quiet }), []);
  const clearToast = useCallback(() => setToast(null), []);
  // A dialog takes the stage: an earlier confirmation has done its job and must not linger
  // over (or behind) the backdrop.
  const anyDialog = dialog !== null;
  useEffect(() => {
    if (anyDialog) setToast(null);
  }, [anyDialog]);

  // The Stages editor: its edits go through the store like any other (undo, autosave, prompt).
  const taskState = useMemo(() => appState({ ...cfg, tab: "task" }), [cfg]);
  const stages = useStages({
    workflow: cfg.workflow,
    onChange: (workflow: WorkflowDict, coalesce?: string) => dispatch({ type: "set", patch: { workflow }, coalesce: coalesce && `wf:${coalesce}` }),
    taskState,
    confirm: (req) => setDialog({ kind: "confirm", ...req }),
    warn: (title, items) => setDialog({ kind: "warnings", title, items }),
    notify,
    flags: cfg.flags,
    flagMode: cfg.flag_mode,
    onFlags: (flags) => dispatch({ type: "set", patch: { flags }, coalesce: "flags" }),
    onFlagMode: (flag_mode) => dispatch({ type: "set", patch: { flag_mode } }),
  });
  const onStages = cfg.tab === "stages";
  // On Stages a workflow with an Intentions block keeps the settings in that block's inspector,
  // so Settings (3) opens it there instead of the floating panel.
  const intentionsId = onStages ? (stages.scene.wf.intentions()?.id ?? null) : null;
  const setWorkspace = (key: WorkspaceKey, value: string, coalesce?: string) => dispatch({ type: "workspace", key, value, coalesce });
  const propsShown = showProps && intentionsId === null;
  const intentionsOpen = intentionsId !== null && stages.selection.focus?.kind === "block" && stages.selection.focus.id === intentionsId;
  const promptShown = showOutput && (onStages || taskPrompt);
  const canMoveFocused = (d: -1 | 1): boolean => {
    const f = stages.selection.focus;
    if (f?.kind === "block") return stages.scene.wf.canMove(f.id, d);
    if (f?.kind === "cancel") return f.i + d >= 0 && f.i + d < stages.workflow.on_cancel.stages.length;
    return false;
  };

  // A prompt that still carries a placeholder ("<describe the task here>") asks first: pasting
  // it would hand an agent an empty task.
  const copyPrompt = useCallback(async (force = false) => {
    const text = copyText(latestPrompt());
    if (!text) return;
    const gaps = promptGaps(text);
    if (gaps.length) setGapsWarned(true);
    if (gaps.length && !force) return setDialog({ kind: "gaps", gaps });
    if (await writeClipboard(text)) {
      setCopied(true);
      // The Copy button turns into "Copied" and the Prompt panel's meta line says so: the
      // toast is only for screen readers.
      notify("Copied to clipboard", "info", true);
    } else notify("Couldn't copy: the browser blocked clipboard access", "error");
  }, [latestPrompt, notify]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(t);
  }, [copied]);

  // The Task field lives at the top of How to work: bring the tab and the panel up, then focus it.
  const openTask = useCallback(() => {
    set({ tab: "task" });
    setTaskPrompt(false);
    patchPrefs({ workClosed: false });
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const t = taskRef.current;
        t?.focus({ preventScroll: true });
        // Show the whole card, its GOAL · TASK eyebrow included.
        t?.closest(".work-task")?.scrollIntoView?.({ block: "nearest" });
      }),
    );
  }, [set, patchPrefs]);

  // Take the user to the first empty input: the Task field, or the workflow's Goal.
  const fillGap = useCallback(
    (gap: PromptGap) => {
      if (gap.key === "task") {
        openTask();
      } else if (gap.key === "stage") {
        // Open the stage the prompt numbers, then put the caret in its description.
        const n = gap.stage ?? "";
        const id = Object.entries(stages.scene.nums).find(([, v]) => v === n)?.[0];
        if (n.startsWith("C")) stages.setFocus({ kind: "cancel", i: Number(n.slice(1)) - 1 }, []);
        else if (id) stages.setFocus({ kind: "block", id }, []);
        else return;
        set({ tab: "stages" });
        stages.editFocused();
        setTimeout(() => document.querySelector<HTMLElement>('aside.inspector textarea[aria-label="Prompt description"]')?.focus(), 60);
      } else if (gap.key === "note") {
        // The first prompt block with no text, caret in its text box.
        const id = stages.workflow.blocks.find((b) => b.type === "prompt" && !String(b.text ?? "").trim())?.id;
        if (!id) return;
        stages.setFocus({ kind: "block", id }, []);
        set({ tab: "stages" });
        stages.editFocused();
        setTimeout(() => document.querySelector<HTMLElement>('aside.inspector textarea[aria-label="Prompt text"]')?.focus(), 60);
      } else {
        set({ tab: "stages" });
        stages.setFocus({ kind: "goal" }, []);
        stages.editFocused();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stages.setFocus, stages.editFocused, stages.scene, stages.workflow, openTask, set],
  );

  // Apply an opened file or link: guard unsaved stage edits when the workflow changes (a settings
  // JSON carries a workflow too), then load it and report warnings or `message`.
  const applyImport = useCallback(
    (res: Extract<ImportResult, { ok: true }>, message: string) => {
      const apply = () => {
        dispatch({ type: "replace", cfg: res.cfg });
        if (res.replacesWorkflow) stages.loaded(res.cfg.workflow);
        if (res.warnings.length) setDialog({ kind: "warnings", title: "Loaded with changes", items: res.warnings });
        else notify(message);
      };
      if (res.replacesWorkflow) stages.discardOk(apply);
      else apply();
    },
    [dispatch, notify, stages],
  );
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  const openFiles = useCallback(
    async (files: FileList | File[] | null) => {
      const file = files?.[0];
      if (!file) return;
      const res = await importFile(file, cfg);
      if (!res.ok) return notify(res.message, "error");
      applyImport(res, res.message);
    },
    [cfg, notify, applyImport],
  );

  // A workflow link (`#wf=<payload>`) opens like a YAML file, on mount and when another link is
  // pasted into this tab. The fragment is cleared first, so a reload doesn't reopen it.
  const openLink = async () => {
    const link = parseLinkHash(location.hash);
    if (!link || link.check) return;
    history.replaceState(null, "", location.pathname + location.search);
    const fail = (why: string) => notify(`Couldn't load workflow from link: ${why}`, "error");
    let text: string;
    try {
      text = await decodePayload(link.payload);
    } catch (e) {
      return fail(e instanceof LinkError ? e.message : "the link could not be read");
    }
    const res = importText(LINK_FILE, text, cfgRef.current);
    if (!res.ok) return fail(res.message.replace(`Couldn't load workflow ${LINK_FILE}: `, ""));
    applyImport(res, `Loaded ${res.cfg.workflow.name} from link`);
  };
  const openLinkRef = useRef(openLink);
  openLinkRef.current = openLink;
  useEffect(() => {
    const onHash = () => void openLinkRef.current();
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const ctx: ActionContext = {
    cfg,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    showProps: intentionsId !== null ? intentionsOpen : showProps,
    showOutput: promptShown,
    hasPrompt: !!shownPrompt,
    copied,
    setTab: (tab) => set({ tab }),
    // On narrow screens the panels overlay the canvas, so only one is open at a time.
    toggleProps: () => {
      if (intentionsId !== null) return stages.setFocus(intentionsOpen ? null : { kind: "block", id: intentionsId });
      patchPrefs((p) => (!p.showProps && narrow() ? { showProps: true, showOutput: false } : { showProps: !p.showProps }));
    },
    showWork: !onStages && !promptShown && !prefs.workClosed,
    toggleWork: () => {
      if (promptShown) {
        setTaskPrompt(false);
        patchPrefs({ workClosed: false });
      } else patchPrefs((p) => ({ workClosed: !p.workClosed }));
    },
    toggleOutput: () => {
      if (!onStages) return promptShown ? setTaskPrompt(false) : showPromptPanel();
      patchPrefs((p) => (!p.showOutput && narrow() ? { showOutput: true, showProps: false } : { showOutput: !p.showOutput }));
    },
    copyPrompt: () => void copyPrompt(),
    openFile: () => fileRef.current?.click(),
    saveConfig: () => {
      downloadText(CONFIG_FILE, configJson(cfg), "application/json");
      notify(`Saved ${CONFIG_FILE}`);
    },
    exportWorkflow: () => {
      const { name, text } = workflowYaml(cfg);
      downloadText(name, text, "text/yaml");
      notify(`Saved ${name}`);
    },
    exportPrompt: () => {
      downloadText("prompt.md", copyText(latestPrompt()) + "\n", "text/markdown");
      notify("Saved prompt.md");
    },
    reset: () => setDialog({ kind: "reset" }),
    undo: () => dispatch({ type: "undo" }),
    redo: () => dispatch({ type: "redo" }),
    setTheme: (mode) => dispatch({ type: "set", patch: { mode }, record: false }),
    cycleTheme: () => dispatch({ type: "set", patch: { mode: nextTheme(cfg.mode) }, record: false }),
    toggle: (key, on) => dispatch({ type: "toggle", key, on }),
    focusTask: openTask,
    openShortcuts: () => setDialog({ kind: "shortcuts" }),
    openPalette: () => setDialog({ kind: "palette" }),
    openIntro: () => setDialog({ kind: "intro" }),
    showWelcome: () => {
      patchPrefs({ welcomeDismissed: false });
      set({ tab: "task" });
    },
    stages: onStages
      ? {
          // Keys and toolbar buttons keep focus where it is, so S S S adds three stages.
          add: (kind) => stages.insert({ after: stages.selection.focus }, kind, null, false),
          hasIntentions: stages.scene.wf.intentions() !== null,
          canLoop: stages.canLoop,
          canPar: stages.canPar,
          makeLoop: () => stages.makeLoop(),
          makePar: () => stages.makePar(),
          fit: stages.fit,
          canDelete: stages.selection.focus?.kind === "block" || stages.selection.focus?.kind === "cancel",
          removeFocused: () => {
            // Delete / Backspace only act on the canvas, never on a focused button or panel.
            const a = document.activeElement;
            if (a && a !== document.body && !a.closest(".stage-surface")) return;
            stages.removeFocused();
          },
          canMoveBack: canMoveFocused(-1),
          canMoveForward: canMoveFocused(1),
          move: stages.moveFocused,
          hasSelection: stages.selection.sel.length > 0,
          hasFocus: stages.selection.focus !== null,
          escape: () => (stages.selection.sel.length ? stages.clearSelection() : stages.setFocus(null)),
          selectAll: stages.selectAll,
          save: stages.save,
          newWorkflow: stages.newWorkflow,
          hasFlags: (stages.workflow.flags ?? []).length > 0,
          flagsOpen: stages.flagsOpen,
          toggleFlags: () => stages.setFlagsOpen(!stages.flagsOpen),
          flagMode: stages.flagMode,
          toggleFlagMode: () => stages.setFlagMode(stages.flagMode === "strip" ? "embed" : "strip"),
        }
      : undefined,
    zoom: onStages
      ? {
          value: Math.round(stages.view.zoom * 100),
          min: Math.round(STAGE_ZOOM_MIN * 100),
          max: Math.round(STAGE_ZOOM_MAX * 100),
          in: () => stages.zoomBy(1),
          out: () => stages.zoomBy(-1),
          reset: stages.zoomReset,
        }
      : {
          value: taskZoom,
          in: () => stepTaskZoom(1),
          out: () => stepTaskZoom(-1),
          // Back to the opening view: 100%, panned home.
          reset: () => setTaskView({ scrollX: 0, scrollY: 0, zoom: 1 }),
          fit: fitTask,
        },
  };
  const actions = buildActions(ctx);

  // A pressed button's tooltip stays hidden until the pointer leaves it.
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-tooltip]") : null;
      if (!el || el.hasAttribute("data-tip-off")) return;
      el.setAttribute("data-tip-off", "");
      // Back on once the pointer really moves off it: a dialog or menu opening over the button
      // fires pointerleave without a move, and closing it would otherwise pop the tooltip up.
      const off = (ev: PointerEvent) => {
        if (ev.target instanceof Node && el.contains(ev.target)) return;
        el.removeAttribute("data-tip-off");
        document.removeEventListener("pointermove", off, true);
      };
      document.addEventListener("pointermove", off, true);
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, []);

  // Tooltips open below their button, except near the bottom of the window (the stage bar, the
  // zoom row, Help), where they open above; near a side edge they align to that edge rather than
  // centre and spill off screen. Placed as the pointer or focus arrives, so it follows the layout.
  useEffect(() => {
    const place = (e: Event) => {
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-tooltip]") : null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (r.top + r.height / 2 > vh * 0.6) el.dataset.tipPos = "top";
      else delete el.dataset.tipPos;
      const half = 136; // half of the tooltip's 16rem cap, plus a margin
      const mid = r.left + r.width / 2;
      if (mid + half > vw) el.dataset.tipAlign = "end";
      else if (mid - half < 0) el.dataset.tipAlign = "start";
      else delete el.dataset.tipAlign;
    };
    document.addEventListener("pointerover", place, true);
    document.addEventListener("focusin", place, true);
    return () => {
      document.removeEventListener("pointerover", place, true);
      document.removeEventListener("focusin", place, true);
    };
  }, []);

  // Focus tooltips are for keyboard travel only (Tab, arrows). Focus put back by a closing
  // menu or dialog, or after a click, shows none: it would sit over the islands next to it.
  useEffect(() => {
    const root = document.documentElement;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Tab" || e.key.startsWith("Arrow")) root.dataset.nav = "keys";
      else if (e.key === "Escape") delete root.dataset.nav;
    };
    const pointer = () => delete root.dataset.nav;
    document.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", pointer, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("pointerdown", pointer, true);
    };
  }, []);

  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const dialogOpen = dialog !== null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogOpen || e.defaultPrevented) return;
      // Escape in a field of the stage inspector leaves the field; the next Escape closes the
      // inspector, so the keyboard alone gets back to the canvas and the Prompt panel.
      const t = e.target;
      if (e.key === "Escape" && !e.metaKey && !e.ctrlKey && !e.altKey && isTyping(t) && t instanceof HTMLElement && t.closest("aside.inspector")) {
        e.preventDefault();
        t.blur();
        return;
      }
      handleShortcut(e, actionsRef.current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialogOpen]);

  return (
    <div
      className="app"
      data-work={onStages || promptShown ? undefined : prefs.workClosed ? "closed" : "open"}
      data-mode={cfg.tab}
      data-props={propsShown ? "open" : "closed"}
      data-output={promptShown ? "open" : "closed"}
      data-demos={(onStages && stages.blank && !promptShown && !stages.selection.focus) || undefined}
      // Any panel open (on phones each is a bottom sheet, and the stage bar steps aside).
      data-sheet={propsShown || promptShown || (onStages && !!stages.selection.focus) || undefined}
      data-dragging={dragging}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        void openFiles(e.dataTransfer.files);
      }}
    >
      <main ref={canvasRef} className="canvas" aria-label={cfg.tab === "task" ? "Task prompt canvas" : "Stages canvas"}>
        <h1 className="visually-hidden">promptdraw</h1>
        {onStages ? (
          <StagesMount
            ctl={stages}
            onAdd={(x, y, spot) => stages.openMenu({ x, y, label: "Add block", items: addMenuItems(stages, spot, !("par" in spot)) })}
            onContextMenu={(x, y, hit) => stages.openMenu({ x, y, label: "Canvas menu", items: contextMenuItems(stages, hit, { x, y }) })}
          />
        ) : (
          <TaskBoard view={taskView} setView={setTaskView}>
            {welcome && <WelcomeCard actions={actions} onDismiss={() => patchPrefs({ welcomeDismissed: true })} />}
            <TaskCanvas>
              <OptionLanes
                onGoal={openTask}
                input={{ task: cfg.task, toggles: cfg.toggles, recon_model: cfg.recon_model, recon_count: cfg.recon_count, review_passes: cfg.review_passes, review_minor: cfg.review_minor }}
                onToggle={onToggle}
                onPrompt={showPromptPanel}
              />
            </TaskCanvas>
          </TaskBoard>
        )}
      </main>

      {welcome && <WelcomeArrows />}

      <div className="region region--top-left" data-inset="top">
        <MainMenu actions={actions} />
        {onStages && <WorkflowIsland ctl={stages} actions={actions} openFile={ctx.openFile} />}
      </div>

      <div className="region region--top-center" data-inset="top">
        <Toolbar actions={actions} />
      </div>

      {onStages && (
        // The stage tools sit at the foot of the canvas on wide screens (the top row stays one
        // toolbar on both tabs, so the panels never jump), under the toolbar on tablets, and
        // above the tab bar on phones.
        <div className="region region--stage-bar" data-inset="bottom">
          <StageBar ctl={stages} actions={actions} />
        </div>
      )}

      {onStages && stages.selection.focus && (
        // The inspector docks on the right, in the Prompt panel's place while it is open.
        <Inspector
          ctl={stages}
          width={cfg.inspector_w}
          onWidth={(inspector_w) => dispatch({ type: "set", patch: { inspector_w }, record: false })}
          settings={<WorkspaceSettings cfg={cfg} set={set} setWorkspace={setWorkspace} />}
          onAddBranch={(el, par) => {
            const r = el.getBoundingClientRect();
            stages.openMenu({ x: r.left, y: r.bottom + 6, label: "Add branch", items: addMenuItems(stages, { par }, false) });
          }}
        />
      )}

      {onStages && stages.blank && !promptShown && !stages.selection.focus && <DemoPanel onOpen={stages.loadStarter} />}

      {!onStages && <WorkPanel
          task={{ task: cfg.task, extra: cfg.extra, taskRef, onTask: (task) => set({ task }, "task"), onExtra: (extra) => set({ extra }, "extra") }}
          hidden={promptShown} closed={prefs.workClosed} onClose={() => patchPrefs({ workClosed: true })} cfg={cfg} set={set} state={promptState} onToggle={onToggle} onReset={() => setDialog({ kind: "reset" })} />}

      {propsShown && (
        <PropertiesPanel
          cfg={cfg}
          set={set}
          setWorkspace={setWorkspace}
          onClose={() => patchPrefs({ showProps: false })}
        />
      )}

      {showOutput && (
        // Hidden, not closed, while the inspector holds the right edge: it keeps its view and
        // scroll, and comes back as the inspector folds away.
        <OutputPanel
          hidden={onStages ? !!stages.selection.focus : !taskPrompt}
          prompt={shownPrompt}
          edited={shownPrompt !== compiled.prompt}
          onEdit={editPrompt}
          onRevert={revertPrompt}
          sections={compiled.sections}
          gaps={promptGaps(shownPrompt)}
          gapTone={gapsWarned ? "warn" : "hint"}
          onFill={fillGap}
          error={compiled.error}
          copied={copied}
          onClose={() => (onStages ? patchPrefs({ showOutput: false }) : setTaskPrompt(false))}
        />
      )}

      <div className="region region--bottom-left" data-inset="bottom">
        <BottomControls actions={actions} zoom={ctx.zoom?.value ?? taskZoom} />
      </div>

      {!onStages && !promptShown && prefs.workClosed && (
        <div className="region region--top-right">
          <WorkOpenButton onClick={() => patchPrefs({ workClosed: false })} />
        </div>
      )}

      <GitHubRibbon />

      <div className="region region--bottom-right">
        <button type="button" className="tool-btn help-trigger island" aria-label="Help: keyboard shortcuts" aria-keyshortcuts="?" data-tooltip={"Keyboard shortcuts (?)\nEvery key and gesture in one list"} onClick={ctx.openShortcuts}>
          <Icon name="help" />
          <span className="tool-label">Help</span>
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={OPEN_ACCEPT}
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="file-input"
        onChange={(e) => {
          void openFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {dialog?.kind === "palette" && <CommandPalette actions={actions} onClose={() => setDialog(null)} />}
      {dialog?.kind === "shortcuts" && <ShortcutsDialog actions={actions} onClose={() => setDialog(null)} />}
      {dialog?.kind === "intro" && (
        <IntroDialog
          onClose={() => {
            markIntroSeen();
            setDialog((d) => (d?.kind === "intro" ? null : d));
          }}
        />
      )}
      {dialog?.kind === "reset" && (
        <ConfirmDialog
          title="Reset"
          message="Clear task, notes and all toggles?"
          confirm="Reset"
          danger
          onConfirm={() => {
            dispatch({ type: "reset" });
            notify("Reset to defaults (undo with Ctrl/⌘+Z)");
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "confirm" && (
        <ConfirmDialog
          title={dialog.title}
          message={dialog.message}
          confirm={dialog.confirm}
          danger={dialog.danger}
          onConfirm={dialog.onConfirm}
          onClose={() => setDialog((d) => (d?.kind === "confirm" ? null : d))}
        />
      )}
      {dialog?.kind === "gaps" && (
        <ConfirmDialog
          title={dialog.gaps.some((g) => g.key === "stage") ? "Copy with an empty stage?" : dialog.gaps.some((g) => g.key === "note") ? "Copy with an empty prompt block?" : "Copy with a placeholder?"}
          message={`${gapsLabel(dialog.gaps)}, so the prompt still says ${dialog.gaps.map((g) => `“${g.placeholder}”`).join(" and ")}. Fill it in first, or copy it as it is.`}
          confirm="Copy anyway"
          cancel={`Fill in ${dialog.gaps[0]!.label.toLowerCase()}`}
          onConfirm={() => void copyPrompt(true)}
          onCancel={() => fillGap(dialog.gaps[0]!)}
          onClose={() => setDialog((d) => (d?.kind === "gaps" ? null : d))}
        />
      )}
      {dialog?.kind === "warnings" && (
        <Dialog title={dialog.title} onClose={() => setDialog(null)} width="34rem">
          <ul className="dialog-list">
            {dialog.items.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <div className="dialog-actions">
            <button type="button" className="btn btn--primary" onClick={() => setDialog(null)}>
              OK
            </button>
          </div>
        </Dialog>
      )}

      {onStages && stages.menu && <PopMenu {...stages.menu} onClose={stages.closeMenu} />}

      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}

/** Brings How to work back: grows in as the panel closes, fades out as it returns. */
function WorkOpenButton({ onClick }: { onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useExitGhost(ref, { keyframes: POP_OUT, duration: EXIT[2] });
  return (
    <button ref={ref} type="button" className="tool-btn work-open island" aria-label="Show How to work" onClick={onClick} title="Show the How to work options">
      <Icon name="toggle" />
      <span className="tool-label">How to work</span>
    </button>
  );
}
