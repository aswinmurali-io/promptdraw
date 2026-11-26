// Use with an AI agent: how to install the promptdraw skill in Claude Code and what the agent
// hands back (a workflow file plus a link that opens it here, checked first in check mode).
// @lat: [[ui#App shell#Use with an AI agent]]
import { useRef, useState } from "react";
import { writeClipboard } from "../lib/clipboard";
import { REPO_URL } from "../lib/ribbon";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";
import "../styles/dialog.css";

const INSTALL_COMMANDS = ["/plugin marketplace add aswinmurali-io/promptdraw", "/plugin install promptdraw@promptdraw"];
const SKILL_URL = `${REPO_URL}/tree/main/plugins/promptdraw/skills/promptdraw`;

export function AgentDialog({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const done = useRef<HTMLButtonElement>(null);
  const copy = async () => {
    if (await writeClipboard(INSTALL_COMMANDS.join("\n"))) setCopied(true);
  };
  return (
    <Dialog title="Use with an AI agent" onClose={onClose} width="34rem" className="agent-dialog" initialFocus={done}>
      <p className="agent-lead">Let Claude Code draw the workflow for you, in any project. It writes the stages, loops and parallel branches, checks them here, and hands you a link that opens them on this canvas.</p>
      <ol className="agent-steps">
        <li>
          <span className="agent-step-title">Install the skill in Claude Code</span>
          <div className="agent-code">
            <pre>{INSTALL_COMMANDS.join("\n")}</pre>
            <button type="button" className="icon-btn icon-btn--sm" aria-label="Copy the install commands" data-tooltip={copied ? "Copied" : "Copy"} onClick={() => void copy()}>
              <Icon name={copied ? "check" : "copy"} size={16} />
            </button>
          </div>
        </li>
        <li>
          <span className="agent-step-title">Ask for a workflow</span>
          <span className="agent-step-text">For example: “Make a promptdraw workflow that fixes the flaky checkout test, with a loop until it passes 20 runs in a row.”</span>
        </li>
        <li>
          <span className="agent-step-title">Open what it hands back</span>
          <span className="agent-step-text">You get a <code>.yaml</code> file and an <strong>Open in promptdraw</strong> link. The link opens the workflow on the Stages tab; the file opens with Open… or a drop.</span>
        </li>
      </ol>
      <p className="agent-note">The workflow travels in the link’s <code>#</code> fragment, so it never reaches a server. Not using Claude Code? Copy the skill folder from{" "}
        <a href={SKILL_URL} target="_blank" rel="noopener noreferrer">GitHub</a> into your agent’s skills.</p>
      <div className="dialog-actions">
        <button ref={done} type="button" className="btn btn--primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Dialog>
  );
}
