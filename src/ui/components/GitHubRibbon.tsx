// A "Star on GitHub" corner ribbon. It sits in the top-right corner of the free canvas: left of
// whatever holds the right edge's top (How to work, the Prompt panel, the stage inspector, the
// starters, the How to work button, the tablet stage bar), and it steps aside entirely when the
// top row has no room for it, so it never covers a close button or a tool.
// @lat: [[ui#Islands]]
import { useEffect, useLayoutEffect, useRef } from "react";
import { ISLANDS, REPO_URL, boxOf, ribbonEdge, type Box } from "../lib/ribbon";

export function GitHubRibbon() {
  const ref = useRef<HTMLDivElement>(null);
  const place = () => {
    const el = ref.current;
    const app = el?.parentElement;
    if (!el || !app || !app.clientWidth) return;
    const boxes = [...app.querySelectorAll<HTMLElement>(ISLANDS)].map(boxOf).filter((b): b is Box => b !== null);
    const edge = ribbonEdge(app.clientWidth, boxes);
    el.hidden = edge === null;
    if (edge !== null) el.style.right = `${app.clientWidth - edge}px`;
  };
  // After every App render (panels open, close, resize), and when the window or fonts change.
  useLayoutEffect(place);
  useEffect(() => {
    window.addEventListener("resize", place);
    void document.fonts?.ready.then(place);
    return () => window.removeEventListener("resize", place);
  }, []);
  return (
    <div ref={ref} className="gh-ribbon">
      <a className="gh-ribbon-band" href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="Star promptdraw on GitHub (opens in a new tab)">
        <span aria-hidden="true">★</span> Star on GitHub
      </a>
    </div>
  );
}
