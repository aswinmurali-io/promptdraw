// First-visit intro: a 30-second video of promptdraw at work, shown once in a dialog before the
// welcome card. It plays muted and inline; reduced motion leaves it paused on its poster with
// the controls, so nothing moves until asked. Help → Watch the intro video brings it back.
// @lat: [[ui#App shell#Intro video]]
import { useRef } from "react";
import { motionOK } from "../lib/motion";
import { Dialog } from "./Dialog";
import "../styles/dialog.css";

/** Served from public/, so it works at a domain root, under a sub-path and in the desktop app. */
const BASE = import.meta.env.BASE_URL;
export const INTRO_VIDEO = `${BASE}intro.mp4`;
export const INTRO_POSTER = `${BASE}intro-poster.webp`;

export function IntroDialog({ onClose }: { onClose: () => void }) {
  const start = useRef<HTMLButtonElement>(null);
  const play = motionOK();
  return (
    <Dialog title="promptdraw in 30 seconds" onClose={onClose} width="58rem" className="intro-dialog" initialFocus={start}>
      <video
        className="intro-video"
        src={INTRO_VIDEO}
        poster={INTRO_POSTER}
        aria-label="A 30-second tour: describe a task, tick how the agent should work, draw stages with parallel reviewers, a loop and A/B flags, then copy the prompt"
        controls
        muted
        playsInline
        autoPlay={play}
        preload={play ? "auto" : "metadata"}
      />
      <div className="dialog-actions">
        <button ref={start} type="button" className="btn btn--primary" onClick={onClose}>
          Start drawing
        </button>
      </div>
    </Dialog>
  );
}
