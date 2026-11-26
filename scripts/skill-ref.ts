// Write the promptdraw skill's generated files from the live core: `npm run skill:ref`.
// @lat: [[testing#Workflow authoring tool]]
import { writeFileSync } from "node:fs";
import { renderExample, renderReference } from "./skillReference";

const dir = new URL("../plugins/promptdraw/skills/promptdraw/", import.meta.url);
writeFileSync(new URL("reference.md", dir), renderReference());
writeFileSync(new URL("example.yaml", dir), renderExample());
console.log("Wrote reference.md and example.yaml");
