// The Intentions block's form: the same fifteen toggles and sub-options as the Task tab's
// rail, bound to the block (the Python app `intention_vars` + `intention_toggles`). Every change
// rewrites the block through block_settings, so stored values are always normalised.
import {
  MOCK_STRENGTH_RANGE,
  PROGRESS_FORMATS,
  RECON_MODELS,
  TOGGLE_ORDER,
  TOGGLE_TEXT,
  WORKER_MODELS,
  blockState,
  type AnyState,
  type Block,
  type ToggleKey,
} from "../../core";
import { digitsOk, optionsEnabled, toggleBlocked } from "../lib/rules";
import { Check, DraftInput } from "./fields";

export function IntentionsForm({ block, onChange }: { block: Block; onChange: (values: AnyState, coalesce?: string) => void }) {
  const s = blockState(block);
  const t = s.toggles;
  const en = optionsEnabled(t, s.mock_hint);
  const write = (patch: AnyState, coalesce?: string) => onChange({ ...s, toggles: { ...t }, ...patch }, coalesce);
  const toggle = (k: ToggleKey, on: boolean) => write({ toggles: { ...t, [k]: on } });
  const [lo, hi] = MOCK_STRENGTH_RANGE;

  const row = (k: ToggleKey, extra?: React.ReactNode, sub?: React.ReactNode) => {
    const blocked = toggleBlocked(k, t);
    return (
      <li key={k} className="intent-row">
        <div className="row row--inline">
          <Check label={TOGGLE_TEXT[k][0]} checked={t[k]} disabled={blocked !== null} title={blocked ?? undefined} onChange={(on) => toggle(k, on)} />
          {extra}
        </div>
        {sub && <div className="intent-sub">{sub}</div>}
      </li>
    );
  };

  return (
    <ul className="intent-form" aria-label="How to work">
      {TOGGLE_ORDER.map((k) => {
        switch (k) {
          case "superpowers":
            return row(k, null, <Check label="Spec only, skip plan" checked={s.spec_only} disabled={!en.spec_only} onChange={(v) => write({ spec_only: v })} />);
          case "recon":
            return row(
              k,
              <select className="field field--mono field--fit" aria-label="Recon model" value={s.recon_model} disabled={!en.recon_model} onChange={(e) => write({ recon_model: e.target.value })}>
                {RECON_MODELS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>,
            );
          case "workers":
            return row(
              k,
              <select className="field field--mono field--fit" aria-label="Workers model" value={s.worker_model} disabled={!en.worker_model} onChange={(e) => write({ worker_model: e.target.value })}>
                {WORKER_MODELS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>,
            );
          case "inline":
            return row(
              k,
              null,
              <>
                <Check label="Keep code review as subagent" checked={s.inline_review} disabled={!en.inline_keep} onChange={(v) => write({ inline_review: v })} />
                <Check label="Keep critique as subagent" checked={s.inline_critique} disabled={!en.inline_keep} onChange={(v) => write({ inline_critique: v })} />
              </>,
            );
          case "progress":
            return row(
              k,
              null,
              <div className="row row--inline">
                <span className="row-label">every</span>
                <DraftInput
                  className="field--mono field--num"
                  label="Progress minutes"
                  inputMode="numeric"
                  value={String(s.progress_minutes)}
                  accept={(v) => digitsOk(v, 3)}
                  disabled={!en.progress}
                  onChange={(v) => write({ progress_minutes: v }, "progress_minutes")}
                />
                <span className="row-label">min</span>
                <select className="field field--mono field--fit" aria-label="Progress format" value={s.progress_format} disabled={!en.progress} onChange={(e) => write({ progress_format: e.target.value })}>
                  {PROGRESS_FORMATS.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </div>,
            );
          case "mocks":
            return row(
              k,
              null,
              <>
                <div className="row row--inline">
                  <span className="row-label">show</span>
                  <DraftInput
                    className="field--mono field--num"
                    label="Mock count"
                    inputMode="numeric"
                    value={String(s.mock_count)}
                    accept={(v) => digitsOk(v, 2)}
                  disabled={!en.mocks}
                    onChange={(v) => write({ mock_count: v }, "mock_count")}
                  />
                  <span className="row-label">iterations</span>
                </div>
                <Check label="Hint deviation" checked={s.mock_hint} disabled={!en.mocks} onChange={(v) => write({ mock_hint: v })} />
                <label className="row row--inline">
                  <span className="row-label">Deviation</span>
                  <input
                    type="range"
                    className="slider"
                    min={lo}
                    max={hi}
                    value={s.mock_strength}
                    disabled={!en.mock_strength}
                    aria-valuetext={`${s.mock_strength}%`}
                    onChange={(e) => write({ mock_strength: Number(e.target.value) }, "mock_strength")}
                  />
                  <span className="slider-value" aria-hidden="true">
                    {s.mock_strength}%
                  </span>
                </label>
              </>,
            );
          default:
            return row(k);
        }
      })}
    </ul>
  );
}
