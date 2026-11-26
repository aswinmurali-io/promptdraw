// The skill's generated files must equal what src/core produces today, and its link helper must
// produce links the app decodes. Fix drift with `npm run skill:ref`.
// @lat: [[testing#Workflow authoring tool]]
import { describe, expect, it } from "vitest";
import { fromYaml } from "../src/core";
import { decodePayload } from "../src/ui/lib/link";
import example from "../plugins/promptdraw/skills/promptdraw/example.yaml?raw";
import reference from "../plugins/promptdraw/skills/promptdraw/reference.md?raw";
// @ts-expect-error -- a dependency-free .mjs shipped with the skill, outside the TS project
import { makeLinks } from "../plugins/promptdraw/skills/promptdraw/link.mjs";
import { renderExample, renderReference } from "./skillReference";

const payloadOf = (link: string) => new URL(link).hash.replace(/^#wf=/, "").replace(/&check$/, "");

describe("promptdraw skill", () => {
  // @lat: [[testing#Workflow authoring tool#Skill files match the app]]
  it("ships the reference and example the app would generate", () => {
    expect(reference).toBe(renderReference());
    expect(example).toBe(renderExample());
    expect(fromYaml(example)[1]).toEqual([]);
  });

  // @lat: [[testing#Workflow authoring tool#Skill links open in the app]]
  it("makes links the app decodes back to the file", async () => {
    const links = makeLinks(example);
    expect(await decodePayload(payloadOf(links.open))).toBe(example);
    expect(links.check.endsWith("&check")).toBe(true);
    expect(links.open.startsWith("https://aswinmurali-io.github.io/promptdraw/#wf=")).toBe(true);
    const text = 'name: café\ngoal: "日本 🚀 ✓"\n';
    expect(await decodePayload(payloadOf(makeLinks(text).open))).toBe(text);
    expect(makeLinks(text, "http://localhost:4173/").open.startsWith("http://localhost:4173/#wf=")).toBe(true);
  });
});
