// One plain line per "How to work" card, so a card at rest reads as a whole sentence rather
// than the first two lines of a long instruction cut off mid-word. Display only: the card's
// "Show all" opens the exact line the toggle adds to the prompt, and the prompt never sees
// these. A toggle missing here shows its prompt line, clamped, as before.
// @lat: [[ui#Canvas]]
import type { ToggleKey } from "../../core";

export const INTENT_SUMMARY: Partial<Record<ToggleKey, string>> = {
  assumptions: "Follow karpathy-guidelines: no guessing, surgical changes.",
  superpowers: "Load the using-superpowers skill and apply matching skills.",
  unity_cli: "Drive Unity through the Unity CLI, after reading its skill.",
  workers: "Split independent parts of the task across worker agents.",
  recon: "Map the code with parallel workers first.",
  inline: "Do all the work in this session: no subagents or workers.",
  high_confidence: "Fix only sure root causes; otherwise stop and explain.",
  ui: "Screenshot, critique and iterate on every UI change.",
  mocks: "Show mock options to pick from before building.",
  tests: "Write tests for anything new and report the real output.",
  android_cdp: "Build a dev patch and test it on an Android emulator.",
  review: "Run a code review when done and address what it finds.",
  review_loop: "Loop review and fix until no critical or high finding is left.",
  progress: "Send a short progress report at a regular interval.",
  dashboard: "Keep a live dashboard of the run as an artifact.",
  pr: "Push the branch, open a PR and review it.",
};
