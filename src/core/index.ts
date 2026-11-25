// Pure TypeScript core: no React, no DOM, no I/O. UI lives in src/ui.
// A faithful port of the Python app's prompt logic (intentions.py, compile.py, workflow.py and
// the pure parts of stage_builder.py); outputs match the Python byte for byte.

/** App id; namespaces localStorage keys and file `type` strings. */
export const APP_ID = "promptdraw";

export * from "./constants";
export * from "./py";
export * from "./intentions";
export * from "./flags";
export * from "./forks";
export * from "./workflow";
export * from "./yaml";
export * from "./compile";
export * from "./config";
export * from "./layout";
