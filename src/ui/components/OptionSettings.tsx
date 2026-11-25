// A ticked "How to work" option's own settings (models, minutes, counts…), shown right under its
// row in the How to work panel, so an option and its settings sit together. The Python app kept them on
// the rail under the toggles; the values and their validation are the same.
// @lat: [[ui#Canvas#How to work panel]]
import {
  MOCK_STRENGTH_RANGE,
  PROGRESS_FORMATS,
  PROGRESS_MINUTES_DEFAULT,
  RECON_COUNT_DEFAULT,
  RECON_COUNT_MAX,
  RECON_MODELS,
  REVIEW_PASSES_DEFAULT,
  WORKER_MODELS,
  mockCount,
  positiveInt,
  type AppConfig,
  type ToggleKey,
} from "../../core";
import { digitsOk, optionNeeds, optionsEnabled } from "../lib/rules";
import { Check, FallbackHint, Need } from "./SettingFields";

export interface OptionSettingsProps {
  id: ToggleKey;
  cfg: AppConfig;
  set: (patch: Partial<AppConfig>, coalesce?: string) => void;
}

/** The settings of one option, or null when it has none. */
export function OptionSettings({ id, cfg, set }: OptionSettingsProps) {
  const en = optionsEnabled(cfg.toggles, cfg.mock_hint);
  const need = optionNeeds(cfg.toggles, cfg.mock_hint);
  switch (id) {
    case "superpowers":
      return <Check label="Spec only, skip plan" checked={cfg.spec_only} onChange={(spec_only) => set({ spec_only })} />;
    case "workers":
      return (
        <label className="row row--inline">
          <span className="row-label">Workers model</span>
          <select className="field field--fit" value={cfg.worker_model} onChange={(e) => set({ worker_model: e.target.value as AppConfig["worker_model"] })}>
            {WORKER_MODELS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      );
    case "recon":
      return (
        <>
          <label className="row row--inline">
            <span className="row-label">Recon model</span>
            <select className="field field--fit" value={cfg.recon_model} disabled={!en.recon_model} onChange={(e) => set({ recon_model: e.target.value as AppConfig["recon_model"] })}>
              {RECON_MODELS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="row row--inline">
            <span className="row-label">Recon agents</span>
            <select
              className="field field--fit"
              value={cfg.recon_count}
              disabled={!en.recon_count}
              title={`Not set: the prompt asks for "several" and the board draws ${RECON_COUNT_DEFAULT}`}
              onChange={(e) => set({ recon_count: e.target.value })}
            >
              <option value="">Not set</option>
              {Array.from({ length: RECON_COUNT_MAX }, (_, i) => String(i + 1)).map((n) => (
                <option key={n} value={n}>{`at most ${n}`}</option>
              ))}
            </select>
          </label>
        </>
      );
    case "inline":
      return (
        <>
          <Check label="Keep code review as subagent" checked={cfg.inline_review} onChange={(inline_review) => set({ inline_review })} />
          <Check label="Keep critique as subagent" checked={cfg.inline_critique} onChange={(inline_critique) => set({ inline_critique })} />
        </>
      );
    case "progress": {
      const minutes = positiveInt(cfg.progress_minutes, PROGRESS_MINUTES_DEFAULT);
      return (
        <>
          <div className="row row--inline row--wrap">
            <label htmlFor="pd-progress-min" className="row-label">
              Report every
            </label>
            <input
              id="pd-progress-min"
              className="field field--num"
              inputMode="numeric"
              value={cfg.progress_minutes}
              aria-invalid={cfg.progress_minutes !== String(minutes)}
              aria-describedby="pd-progress-hint"
              onChange={(e) => digitsOk(e.target.value, 3) && set({ progress_minutes: e.target.value }, "progress_minutes")}
            />
            <span className="row-label">min</span>
            <select className="field field--fit" aria-label="Progress format" value={cfg.progress_format} onChange={(e) => set({ progress_format: e.target.value as AppConfig["progress_format"] })}>
              {PROGRESS_FORMATS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </div>
          <FallbackHint id="pd-progress-hint" show={cfg.progress_minutes !== String(minutes)} text={`Not a positive number: uses ${minutes} min`} />
        </>
      );
    }
    case "review_loop": {
      const passes = positiveInt(cfg.review_passes, REVIEW_PASSES_DEFAULT);
      return (
        <>
          <div className="row row--inline">
            <label htmlFor="pd-review-passes" className="row-label">
              At most
            </label>
            <input
              id="pd-review-passes"
              className="field field--num"
              inputMode="numeric"
              value={cfg.review_passes}
              aria-invalid={cfg.review_passes !== String(passes)}
              aria-describedby="pd-review-hint"
              onChange={(e) => digitsOk(e.target.value, 2) && set({ review_passes: e.target.value }, "review_passes")}
            />
            <span className="row-label">passes</span>
          </div>
          <FallbackHint id="pd-review-hint" show={cfg.review_passes !== String(passes)} text={`Not a positive number: uses ${passes}`} />
          <Check label="Also fix medium and low findings" checked={cfg.review_minor} onChange={(review_minor) => set({ review_minor })} />
        </>
      );
    }
    case "mocks": {
      const count = mockCount(cfg.mock_count);
      const [lo, hi] = MOCK_STRENGTH_RANGE;
      return (
        <>
          <div className="row row--inline">
            <label htmlFor="pd-mock-count" className="row-label">
              Show
            </label>
            <input
              id="pd-mock-count"
              className="field field--num"
              inputMode="numeric"
              value={cfg.mock_count}
              aria-invalid={cfg.mock_count !== String(count)}
              aria-describedby="pd-mock-hint"
              onChange={(e) => digitsOk(e.target.value, 2) && set({ mock_count: e.target.value }, "mock_count")}
            />
            <span className="row-label">mock iterations</span>
          </div>
          <FallbackHint id="pd-mock-hint" show={cfg.mock_count !== String(count)} text={`Not a positive number: uses ${count}`} />
          <Check label="Hint deviation" checked={cfg.mock_hint} onChange={(mock_hint) => set({ mock_hint })} />
          {!en.mock_strength && <Need text={need.mock_strength} block />}
          <label className="row row--inline">
            <span className="row-label">Deviation</span>
            <input
              type="range"
              className="slider"
              min={lo}
              max={hi}
              value={cfg.mock_strength}
              aria-valuetext={`${cfg.mock_strength}%`}
              disabled={!en.mock_strength}
              onChange={(e) => set({ mock_strength: Number(e.target.value) }, "mock_strength")}
            />
            <span className="slider-value" aria-hidden="true">
              {cfg.mock_strength}%
            </span>
          </label>
        </>
      );
    }
    default:
      return null;
  }
}
