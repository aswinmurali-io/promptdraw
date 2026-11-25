// Modal dialog: centred island over a dimmed backdrop. Traps focus, closes on Escape or a
// backdrop click, and gives focus back to whatever had it when it opened.
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Icon } from "./Icon";
import { FADE_OUT, useExitGhost } from "../lib/motion";
import "../styles/dialog.css";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Visually hide the title (still the accessible name). */
  hideTitle?: boolean;
  width?: string;
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
  role?: "dialog" | "alertdialog";
}

export function Dialog({ title, onClose, children, hideTitle, width, initialFocus, className, role = "dialog" }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  // Closing: the backdrop (and the dialog on it) fades out in 160 ms.
  useExitGhost(backdropRef, { keyframes: FADE_OUT, duration: 160 });
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const box = ref.current;
    const first = initialFocus?.current ?? box?.querySelector<HTMLElement>(FOCUSABLE) ?? box;
    first?.focus();
    return () => previous?.focus?.();
  }, [initialFocus]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCloseRef.current();
      return;
    }
    if (e.key !== "Tab" || !ref.current) return;
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0] as HTMLElement;
    const last = items[items.length - 1] as HTMLElement;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div ref={backdropRef} className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className={"dialog island " + (className ?? "")}
        role={role}
        aria-modal="true"
        aria-labelledby="dialog-title"
        tabIndex={-1}
        style={width ? { maxWidth: width } : undefined}
        onKeyDown={onKeyDown}
      >
        <header className={"dialog-head" + (hideTitle ? " visually-hidden" : "")}>
          <h2 id="dialog-title" className="dialog-title">
            {title}
          </h2>
          <button type="button" className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

/** Yes / no confirmation (the Python app's messagebox.askyesno). */
export function ConfirmDialog({
  title,
  message,
  confirm,
  danger,
  cancel = "Cancel",
  onConfirm,
  onCancel,
  onClose,
}: {
  title: string;
  message: string;
  confirm: string;
  danger?: boolean;
  /** The safe button's words ("Cancel" by default) and what it does besides closing. */
  cancel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  onClose: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog title={title} onClose={onClose} width="26rem" initialFocus={cancelRef} role="alertdialog">
      <p className="dialog-message">{message}</p>
      <div className="dialog-actions">
        <button
          ref={cancelRef}
          type="button"
          className="btn"
          onClick={() => {
            onClose();
            onCancel?.();
          }}
        >
          {cancel}
        </button>
        <button
          type="button"
          className={"btn " + (danger ? "btn--danger" : "btn--primary")}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirm}
        </button>
      </div>
    </Dialog>
  );
}
