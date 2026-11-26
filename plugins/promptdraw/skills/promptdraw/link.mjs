#!/usr/bin/env node
// Print the promptdraw links for a workflow YAML file: one that opens it in the app and one that
// checks it in an isolated check mode. No dependencies; Node 16+.
//
//   node link.mjs <file.yaml> [--base <url>]
//
// The workflow travels in the URL fragment (#wf=...), so it never reaches a server.
import { readFileSync, realpathSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";

export const SITE_URL = "https://aswinmurali-io.github.io/promptdraw/";
export const LINK_LIMIT = 8000;

export function makeLinks(yaml, base = SITE_URL) {
  const payload = deflateRawSync(Buffer.from(yaml, "utf8"), { level: 9 }).toString("base64url");
  return { open: `${base}#wf=${payload}`, check: `${base}#wf=${payload}&check`, length: payload.length };
}

// Run as a CLI (compared by real path, so a symlinked skill folder or /tmp still runs it).
const invoked = process.argv[1] ? realpathSync(process.argv[1]) : "";
if (invoked === realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--base");
  const base = at >= 0 ? args.splice(at, 2)[1] : SITE_URL;
  const [file] = args;
  if (!file || !base) {
    console.error("usage: node link.mjs <file.yaml> [--base <url>]");
    process.exit(2);
  }
  const links = makeLinks(readFileSync(file, "utf8"), base);
  console.log(`open: ${links.open}`);
  console.log(`check: ${links.check}`);
  console.log(`length: ${links.length}`);
  if (links.length > LINK_LIMIT) console.log(`note: link is over ${LINK_LIMIT} characters; hand off the file only`);
}
