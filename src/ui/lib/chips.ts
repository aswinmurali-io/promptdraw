// How the Prompt panel's section chips word the Python app's section names. The core keeps the names
// byte for byte (prompt output depends on them), so a one-step workflow is "workflow 1
// steps" there; the chip says "1 step".

/** A section name as its chip says it. */
export function chipLabel(section: string): string {
  return section.replace(/^workflow 1 steps$/, "workflow 1 step");
}
