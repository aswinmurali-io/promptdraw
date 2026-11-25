// Bottom-left islands: zoom (− / % / +, clicking the % resets) and undo / redo, which grey
// out when there is nothing to do. Both read from the action registry.
import { shortcutLabel, type AppAction } from "../actions";
import { Icon } from "./Icon";

export function BottomControls({ actions, zoom }: { actions: AppAction[]; zoom: number }) {
  const byId = new Map(actions.map((a) => [a.id, a]));
  const btn = (id: string, extraClass = "") => {
    const a = byId.get(id);
    if (!a?.icon) return null;
    const key = shortcutLabel(a);
    return (
      <button
        type="button"
        className={"icon-btn icon-btn--sm " + extraClass}
        aria-label={a.label}
        data-tooltip={key ? `${a.label} (${key})` : a.label}
        aria-keyshortcuts={key}
        disabled={a.enabled === false}
        onClick={a.perform}
      >
        <Icon name={a.icon} size={18} />
      </button>
    );
  };
  const reset = byId.get("view.zoomReset");
  // The zoom island also frames the whole workflow (Stages) or board (Simple task), in words.
  const fit = byId.get("stages.fit") ?? byId.get("view.fit");
  return (
    <>
      {reset && (
        <div className="island zoom-island" role="group" aria-label="Zoom">
          {btn("view.zoomOut")}
          <button type="button" className="zoom-value" onClick={reset.perform} data-tooltip={`Reset zoom (${shortcutLabel(reset)})`} aria-label={`Zoom ${zoom}%, reset to 100%`}>
            {zoom}%
          </button>
          {btn("view.zoomIn")}
          {fit && (
            <>
              <span className="toolbar-divider" aria-hidden="true" />
              <button type="button" className="tool-btn zoom-fit" aria-label={fit.label} aria-keyshortcuts={shortcutLabel(fit)} data-tooltip={`${fit.label} (${shortcutLabel(fit)})\n${fit.hint ?? ""}`} onClick={fit.perform}>
                <Icon name="fit" size={16} />
                <span className="tool-label">Fit</span>
              </button>
            </>
          )}
        </div>
      )}
      <div className="island history-island" role="group" aria-label="History">
        {btn("edit.undo")}
        {btn("edit.redo")}
      </div>
    </>
  );
}
