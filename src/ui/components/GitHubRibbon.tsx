// A "Star me on GitHub" corner ribbon, stitched like the classic "Fork me on GitHub" one. It sits in the top-right corner of the free canvas: the window's
// corner, or left of a panel docked from the window's top (How to work, the Prompt panel, the
// stage inspector). It steps aside entirely otherwise, so it never covers a close button or a
// tool and its cut end never hangs in open canvas beside a short or floating island.
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
        <span className="gh-ribbon-stitch">
          <span aria-hidden="true">★</span> Star me on GitHub
        </span>
      </a>
    </div>
  );
}
