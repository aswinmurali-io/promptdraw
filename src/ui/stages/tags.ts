// The A/B tags drawn over the stage canvas, and what each one does when it is pressed. Pure: the
// layout says where the cards and fork frames are, the scene says which variants the flags choose.
// A tag is both a label and a control: a variant's tag switches the flags to that variant, and a
// fork's or a card's `A/B · flag` tag opens the prompt flags.
// @lat: [[stages#Prompt flags UI]]
import { inlineText, seedOf, variantText, type Scene } from "./scene";

export interface TagSpec {
  /** A unique key. */
  key: string;
  /** `lane`: above a fork lane; `fork`: on the fork frame; `lone`: a `when` block outside a fork; `inline`: `{{#if}}` branches inside a card's text. */
  kind: "lane" | "fork" | "lone" | "inline";
  /** The tag's anchor point and which side of it the tag grows from. */
  x: number;
  y: number;
  anchor: "left" | "right" | "center";
  text: string;
  /** Filled (the variant in play) or outlined. */
  on: boolean;
  /** `fill` is solid, `dash` a dashed outline, `line` a plain outline. */
  look: "fill" | "dash" | "line";
  max: number;
  seed: number;
  /** The flag it concerns, and what pressing it does. */
  flag: string;
  /** `choose` switches to the variant of `block`; `flags` opens the flags popover on `flag`. */
  action: "choose" | "flags";
  block?: string;
  label: string;
  title: string;
}

const NO_CARD = (k: string) => k === "goal" || k === "on_cancel" || k.startsWith("cancel:");

/** Every tag of the scene, fork pills and lane tags first, then the cards' tags in flow order. Empty on the task board. */
export function sceneTags(scene: Scene): TagSpec[] {
  const { L, wf, variants, inline, board } = scene;
  if (board) return [];
  const mode = scene.flagMode ?? "embed";
  const out: TagSpec[] = [];
  for (const [fid, [x0, y0, x1]] of L.forks) {
    const flag = L.forkInfo.get(fid)?.flag ?? "";
    out.push({
      key: "fork:" + fid, kind: "fork", x: (x0 + x1) / 2, y: y0, anchor: "center", text: "A/B · " + flag, on: false, look: "line",
      max: x1 - x0 - 24, seed: seedOf(fid + "pill"), flag, action: "flags",
      label: `A/B test on ${flag}. Press to open the prompt flags`, title: "Click to open the prompt flags",
    });
  }
  for (const [bid, [lx, ly]] of L.forkLabels) {
    const v = variants?.get(bid);
    if (!v) continue;
    out.push({
      key: "lane:" + bid, kind: "lane", x: lx, y: ly, anchor: "left", text: variantText(v, mode), on: v.selected, look: v.selected ? "fill" : "dash",
      max: 260, seed: seedOf(bid + "vt"), flag: v.flag, action: "choose", block: bid,
      label: v.selected ? `Variant ${v.letter} of ${v.flag}, chosen` : `Variant ${v.letter} of ${v.flag}, not chosen. Press to switch to it`,
      title: v.selected ? `Variant ${v.letter} is chosen` : `Click to switch to variant ${v.letter}`,
    });
  }
  for (const [key, [x0, y0, x1]] of L.cards) {
    if (NO_CARD(key) || !wf.block(key)) continue;
    const v = variants?.get(key);
    const inl = inline?.get(key);
    const lone = !!v && !L.forkLabels.has(key);
    const room = x1 - x0 - 24;
    if (lone && v) {
      out.push({
        key: "lone:" + key, kind: "lone", x: x0 + 12, y: y0 - 1, anchor: "left", text: variantText(v, mode), on: v.selected, look: v.selected ? "fill" : "dash",
        max: inl ? Math.round(room * 0.55) : room, seed: seedOf(key) + 5, flag: v.flag, action: "choose", block: key,
        label: v.selected ? `Variant ${v.letter} of ${v.flag}, chosen` : `Variant ${v.letter} of ${v.flag}, not chosen. Press to switch to it`,
        title: v.selected ? `Variant ${v.letter} is chosen` : `Click to switch to variant ${v.letter}`,
      });
    }
    if (inl) {
      const flag = inl.flags[0] ?? "";
      const picks = inl.letter ? `, following variant ${inl.letter}` : "";
      out.push({
        key: "inline:" + key, kind: "inline", x: lone ? x1 - 12 : x0 + 12, y: y0 - 1, anchor: lone ? "right" : "left", text: inlineText(inl), on: true, look: "fill",
        max: lone ? Math.round(room * 0.45) - 4 : room, seed: seedOf(key) + 7, flag, action: "flags",
        label: `${inl.count} A/B branches on ${inl.flags.join(", ") || "a flag"}${picks}. Press to open the prompt flags`,
        title: `${inl.count} branches in this text${inl.letter ? `, following variant ${inl.letter}` : ""}. Click to open the prompt flags`,
      });
    }
  }
  return out;
}
