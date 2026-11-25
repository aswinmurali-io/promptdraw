// A single transient message at the bottom centre, just above the foot row of islands,
// announced politely to screen readers. A confirmation is gone in 1.8 s; an error stays a
// little longer so it can be read. A `quiet` message is for screen readers only: the control
// that triggered it already shows the result where the eye is (Copy turns into "Copied"), so
// a second box over the board's cards would only cover them.
import { useEffect } from "react";
import { Icon } from "./Icon";
import { Exit } from "../lib/motion";
import "../styles/toast.css";

export interface ToastMessage {
  id: number;
  text: string;
  tone?: "info" | "error";
  quiet?: boolean;
}

export const TOAST_MS = 1800;
export const TOAST_ERROR_MS = 3500;

export function Toast({ toast, onDone }: { toast: ToastMessage | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDone, toast.tone === "error" ? TOAST_ERROR_MS : TOAST_MS);
    return () => clearTimeout(t);
  }, [toast, onDone]);
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && (
        <Exit key={toast.id} opts={{ keyframes: [{ opacity: 1 }, { opacity: 0 }], duration: 160 }}>
        <div className={toast.quiet ? "visually-hidden" : "toast island" + (toast.tone === "error" ? " toast--error" : "")}>
          {toast.tone !== "error" && <Icon name="check" size={16} />}
          <span>{toast.text}</span>
        </div>
        </Exit>
      )}
    </div>
  );
}
