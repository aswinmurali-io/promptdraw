// @lat: [[ui#Workflow links]]
import { describe, expect, it } from "vitest";
import { buildLink, decodePayload, encodePayload, LinkError, parseLinkHash, SITE_URL } from "./link";

describe("workflow link codec", () => {
  it("round-trips ASCII and Unicode", async () => {
    for (const s of ["name: hi\n", 'goal: "Résumé ✓ 日本 🚀"\n']) expect(await decodePayload(await encodePayload(s))).toBe(s);
  });

  it("decodes payloads made by Node zlib.deflateRawSync", async () => {
    expect(await decodePayload("y0vMTbVSyMjkAgA")).toBe("name: hi\n");
    expect(await decodePayload("S89PzLFSUAo6vLK4NPfwSoVHcyYrPJu-9NmcNUpcAA")).toBe('goal: "Résumé ✓ 日本"\n');
  });

  it("encodes to base64url without padding", async () => {
    expect(await encodePayload("x".repeat(500))).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("rejects bad payloads with LinkError", async () => {
    await expect(decodePayload("!!!")).rejects.toBeInstanceOf(LinkError);
    await expect(decodePayload("AAAA")).rejects.toBeInstanceOf(LinkError);
  });

  it("parses link hashes", () => {
    expect(parseLinkHash("#wf=abc")).toEqual({ payload: "abc", check: false });
    expect(parseLinkHash("#wf=abc&check")).toEqual({ payload: "abc", check: true });
    for (const h of ["", "#", "#wf=", "#other=1"]) expect(parseLinkHash(h)).toBeNull();
  });

  it("builds links", () => {
    expect(buildLink(SITE_URL, "abc")).toBe("https://aswinmurali-io.github.io/promptdraw/#wf=abc");
    expect(buildLink(SITE_URL, "abc", true)).toBe("https://aswinmurali-io.github.io/promptdraw/#wf=abc&check");
  });
});
