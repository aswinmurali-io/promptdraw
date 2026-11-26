// Outline icons drawn for promptdraw in a Tabler-like style: 24 grid, 1.75 stroke, round
// caps and joins, no fill, currentColor. Original paths, not copied from any icon set.
import type { ReactNode } from "react";

const PATHS = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  addBlock: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
  open: <path d="M4 18V7a1 1 0 0 1 1-1h4l2 2h7a1 1 0 0 1 1 1v2M4 18l2.6-6.2a1 1 0 0 1 .9-.6H20l-2.6 6.2a1 1 0 0 1-.9.6z" />,
  save: (
    <>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
      <path d="M5 17v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2" />
    </>
  ),
  fileCode: (
    <>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
      <path d="m10 12-2 2 2 2M14 12l2 2-2 2" />
    </>
  ),
  fileText: (
    <>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M9 13h6M9 17h4" />
    </>
  ),
  reset: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4 4v4h4" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1.1 1.1M17.3 17.3l1.1 1.1M5.6 18.4l1.1-1.1M17.3 6.7l1.1-1.1" />
    </>
  ),
  moon: <path d="M12 3a6.5 6.5 0 0 0 8.5 8.6A8.5 8.5 0 1 1 12 3z" />,
  system: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  play: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l5.5-3.5z" />
    </>
  ),
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 16.9l-5.25 2.8 1-5.85L3.5 9.7l5.9-.9z" />,
  agent: (
    <>
      <path d="M10 4.5l1.6 4.4L16 10.5l-4.4 1.6L10 16.5l-1.6-4.4L4 10.5l4.4-1.6z" />
      <path d="M17.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.8 9.5a2.3 2.3 0 0 1 4.4.8c0 1.5-2.2 2-2.2 3.4M12 17h.01" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6" />
    </>
  ),
  command: <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  check: <path pathLength={1} d="m5 12 5 5L20 7" />,
  lock: (
    <>
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  undo: <path d="M9 13 5 9l4-4M5 9h10a4 4 0 0 1 0 8h-1" />,
  redo: <path d="m15 13 4-4-4-4M19 9H9a4 4 0 0 0 0 8h1" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  pencil: (
    <>
      <path d="M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  stages: (
    <>
      <rect x="3" y="9" width="5" height="6" rx="1" />
      <rect x="16" y="4" width="5" height="6" rx="1" />
      <rect x="16" y="14" width="5" height="6" rx="1" />
      <path d="M8 12h3.5M11.5 7v10M11.5 7H16M11.5 17H16" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  prompt: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m7 9 3 3-3 3M12 15h5" />
    </>
  ),
  // The two panel toggles say what the panel holds rather than where it docks: Settings is a
  // set of sliders, Prompt a page of text. The `.icon-pane` shape (the knobs, the page) is
  // filled while the panel is shown, see toolbar.css.
  settingsPanel: (
    <>
      <circle className="icon-pane" cx="15" cy="6" r="2" stroke="none" />
      <circle className="icon-pane" cx="9" cy="12" r="2" stroke="none" />
      <circle className="icon-pane" cx="17" cy="18" r="2" stroke="none" />
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  promptPanel: (
    <>
      <path className="icon-pane" d="M7 3.9h6.6l4.5 4.5V19a1.1 1.1 0 0 1-1.1 1.1H7A1.1 1.1 0 0 1 5.9 19V5A1.1 1.1 0 0 1 7 3.9z" stroke="none" />
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M9 11.5h6M9 14.5h6M9 17.5h3.5" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m20 20-5-5" />
    </>
  ),
  toggle: (
    <>
      <rect x="3" y="7" width="18" height="10" rx="5" />
      <circle cx="16" cy="12" r="2.5" />
    </>
  ),
  pin: <path d="M9 4h6l-1 5 3 3H7l3-3zM12 15v5" />,
  focus: (
    <>
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  expand: <path d="M14 4h6v6M20 4l-6.5 6.5M10 20H4v-6M4 20l6.5-6.5" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
    </>
  ),
  block: <rect x="4" y="6" width="16" height="12" rx="2.5" />,
  note: (
    <>
      <path d="M5 5h14v9l-5 5H5z" strokeDasharray="2.5 2" />
      <path d="M14 19v-5h5" />
    </>
  ),
  fn: <path d="M15.5 4.5c-2.5-.8-4 .3-4.5 3L9.5 17c-.5 2.6-2 3.4-4 2.6M7.5 10.5h7" />,
  intentions: (
    <>
      <path d="m5 7 1.5 1.5L9 6M5 13l1.5 1.5L9 12M5 19l1.5 1.5L9 18" />
      <path d="M12 7.5h7M12 13.5h7M12 19.5h4" />
    </>
  ),
  loop: (
    <>
      <path d="M19.5 11A7.5 7.5 0 0 0 6.6 6.5L4.5 8.5" />
      <path d="M4.5 4.5v4h4M4.5 13a7.5 7.5 0 0 0 12.9 4.5l2.1-2" />
      <path d="M19.5 19.5v-4h-4" />
    </>
  ),
  parallel: <path d="M4 12h3m0 0 3-5h10M7 12l3 5h10M17 4.5 20 7l-3 2.5M17 14.5l3 2.5-3 2.5" />,
  flag: <path d="M5 21V4m0 0h12l-2.5 4.25L17 12.5H5" />,
  fit: (
    <>
      <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />
      <rect x="8.5" y="8.5" width="7" height="7" rx="1" />
    </>
  ),
  trash: <path d="M5 7h14M10 11v6M14 11v6M6.5 7l1 12a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1l1-12M9.5 7V4.5h5V7" />,
  chevronDown: <path d="m7 10 5 5 5-5" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  selectAll: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2.5" strokeDasharray="3 2.5" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 4.3 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4M12 17h.01" />
    </>
  ),
  library: (
    <>
      <path d="M5 4h4v16H5zM10 4h4v16h-4z" />
      <path d="m15.5 5 3.8-1 3 15.6-3.8 1z" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
