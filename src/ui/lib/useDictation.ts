// Dictation into a prompt field: the browser's own speech recognition (Web Speech API, on
// device or the browser vendor's service; promptdraw sends nothing anywhere itself). Each
// finished phrase is inserted at the field's caret, spaced from its neighbours, while the
// phrase still being heard is shown as a live preview.
// @lat: [[stages#Stage editor#Dictation]]
import { useCallback, useEffect, useRef, useState } from "react";

/** The slice of the Web Speech API used here (Chrome / Safari only ship it prefixed). */
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const dictationSupported = () => recognitionCtor() !== null;

/**
 * `text` with a spoken `phrase` put in at `at`: trimmed, a space added before it unless it
 * starts a line or follows a space, and one after it unless a space or line break follows.
 * Returns the new text and the caret just after the phrase.
 */
export function insertPhrase(text: string, at: number, phrase: string): { text: string; caret: number } {
  const p = phrase.trim();
  const i = Math.max(0, Math.min(at, text.length));
  if (!p) return { text, caret: i };
  const before = text.slice(0, i);
  const after = text.slice(i);
  const lead = before === "" || /\s$/.test(before) ? "" : " ";
  const trail = after !== "" && !/^\s/.test(after) ? " " : "";
  const put = lead + p + trail;
  return { text: before + put + after, caret: i + lead.length + p.length };
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Microphone blocked. Allow it for this site in the browser's settings.",
  "service-not-allowed": "Dictation is turned off in this browser.",
  "audio-capture": "No microphone found.",
  network: "Dictation needs a network connection in this browser.",
};

export interface Dictation {
  supported: boolean;
  listening: boolean;
  /** The phrase still being heard, not yet put in the text. */
  interim: string;
  error: string | null;
  toggle(): void;
  stop(): void;
}

/**
 * Dictate into a text: `get` reads the current text, `set` writes a new one, and `area` is the
 * text area whose caret marks where phrases go (the end when there is none, e.g. in Preview).
 */
export function useDictation(get: () => string, set: (v: string) => void, area: () => HTMLTextAreaElement | null): Dictation {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const io = useRef({ get, set, area });
  io.current = { get, set, area };

  const stop = useCallback(() => {
    rec.current?.stop();
  }, []);

  useEffect(() => () => rec.current?.abort(), []);

  const toggle = useCallback(() => {
    if (rec.current) {
      rec.current.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = (typeof navigator !== "undefined" && navigator.language) || "en-US";
    r.onresult = (e) => {
      const { get, set, area } = io.current;
      const start = get();
      const el = area();
      let text = start;
      let caret = el && el.isConnected ? el.selectionEnd : text.length;
      let live = "";
      for (let k = e.resultIndex; k < e.results.length; k++) {
        const res = e.results[k];
        if (!res) continue;
        const said = res[0]?.transcript ?? "";
        if (res.isFinal) ({ text, caret } = insertPhrase(text, caret, said));
        else live += said;
      }
      setInterim(live.trim());
      if (text === start) return;
      set(text);
      // React writes the new value first, which can throw the caret to the end.
      requestAnimationFrame(() => {
        if (el && el.isConnected) el.setSelectionRange(caret, caret);
      });
    };
    r.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") setError(ERRORS[e.error] ?? "Dictation stopped: " + e.error);
    };
    r.onend = () => {
      rec.current = null;
      setListening(false);
      setInterim("");
    };
    rec.current = r;
    setError(null);
    setListening(true);
    try {
      r.start();
    } catch {
      rec.current = null;
      setListening(false);
    }
  }, []);

  return { supported: dictationSupported(), listening, interim, error, toggle, stop };
}
