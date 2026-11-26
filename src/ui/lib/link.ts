// Workflow links: a workflow's YAML carried in the URL fragment (`#wf=<payload>`, plus `&check`
// for check mode), so an agent can hand the user a link that opens it. The payload is base64url,
// unpadded, of the YAML's UTF-8 bytes compressed with raw DEFLATE; it never leaves the fragment,
// so no server sees it.
// @lat: [[ui#Workflow links]]

export const SITE_URL = "https://aswinmurali-io.github.io/promptdraw/";

/** Payload length past which a hand-off gives the file only (a display limit; links still work). */
export const LINK_LIMIT = 8000;

/** A payload that isn't base64url, raw DEFLATE or UTF-8. */
export class LinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinkError";
  }
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const input = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
  const reader = input.pipeThrough(stream).getReader();
  const parts: Uint8Array[] = [];
  for (let r = await reader.read(); !r.done; r = await reader.read()) parts.push(r.value);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new LinkError("the link is not valid base64url");
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    throw new LinkError("the link is not valid base64url");
  }
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function encodePayload(yaml: string): Promise<string> {
  return toBase64Url(await pipe(new TextEncoder().encode(yaml), new CompressionStream("deflate-raw")));
}

export async function decodePayload(payload: string): Promise<string> {
  const bytes = fromBase64Url(payload);
  let raw: Uint8Array;
  try {
    raw = await pipe(bytes, new DecompressionStream("deflate-raw"));
  } catch {
    throw new LinkError("the link is cut short or damaged");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    throw new LinkError("the link does not hold UTF-8 text");
  }
}

/** The payload and mode of a `#wf=` fragment, or null when the fragment is not a workflow link. */
export function parseLinkHash(hash: string): { payload: string; check: boolean } | null {
  const m = /^#wf=([^&]+)(&check)?$/.exec(hash);
  return m?.[1] ? { payload: m[1], check: !!m[2] } : null;
}

export function buildLink(base: string, payload: string, check = false): string {
  return `${base}#wf=${payload}${check ? "&check" : ""}`;
}
