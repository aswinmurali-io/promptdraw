// The A/B tags over the stage canvas (see tags.ts): a second SVG on top of the scene so the tags are real
// controls, with a name, a tooltip, a hover state and keyboard focus, while the scene's own drawing stays
// hidden from assistive tech. Pointer presses carry data-hit, so the canvas turns them into actions.
import { memo } from "react";
import { wrap } from "../../core";
import { FONTS, measure } from "./scene";
import { INK, roughRect } from "./sketch";
import { Paths } from "./SceneView";
import type { TagSpec } from "./tags";

const H = 20;

function Tag({ t }: { t: TagSpec }) {
  const text = wrap(t.text, (s) => measure("pill", s), t.max - 18, 1)[0] as string;
  const w = measure("pill", text) + 18;
  const x0 = t.anchor === "right" ? t.x - w : t.anchor === "center" ? t.x - w / 2 : t.x;
  const top = t.y - H / 2;
  const fill = t.look === "fill";
  return (
    <g
      className="sk-variant sk-tag"
      data-tag={t.kind}
      data-hit={t.action === "choose" ? "variant" : "flags"}
      data-key={t.action === "choose" ? t.block : t.flag}
      data-on={t.on || undefined}
      data-inline={t.kind === "inline" || undefined}
      role="button"
      tabIndex={0}
      aria-label={t.label}
      aria-pressed={t.action === "choose" ? t.on : undefined}
    >
      <title>{t.title}</title>
      <rect className="sk-tag-ring" x={x0 - 3} y={top - 3} width={w + 6} height={H + 6} rx={13} fill="none" />
      <path className="sk-tag-bg" d={`M${x0 + 10} ${top}h${w - 20}a10 10 0 0 1 0 ${H}h${-(w - 20)}a10 10 0 0 1 0 ${-H}z`} fill={fill ? INK.ab : INK.surface} />
      <Paths paths={roughRect(x0, top, x0 + w, top + H, 10, { stroke: INK.ab, width: 1.2, dash: t.look === "dash" ? [4, 3] : undefined, seed: t.seed, roughness: 0.7 })} />
      <text x={x0 + w / 2} y={t.y} fill={fill ? INK.surface : INK.ab} textAnchor="middle" dominantBaseline="central" style={{ font: FONTS.pill }}>
        {text}
      </text>
    </g>
  );
}

export const TagsLayer = memo(function TagsLayer({ tags, transform }: { tags: TagSpec[]; transform: string }) {
  if (!tags.length) return null;
  return (
    <svg className="stage-svg stage-tags" width="100%" height="100%" role="group" aria-label="A/B variants">
      <g transform={transform}>
        <g className="sk-fork-tags">{tags.filter((t) => t.kind === "lane").map((t) => <Tag key={t.key} t={t} />)}</g>
        <g className="sk-card-tags">{tags.filter((t) => t.kind !== "lane").map((t) => <Tag key={t.key} t={t} />)}</g>
      </g>
    </svg>
  );
});
