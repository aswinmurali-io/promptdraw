// The check-mode island: says nothing is saved, offers to open the link for real, and prints the
// Workflow check report as plain text an agent can read.
// @lat: [[ui#Workflow links#Check mode]]
import { reportText, type CheckResult } from "../lib/check";
import { buildLink, parseLinkHash } from "../lib/link";

export function CheckReport({ result }: { result: CheckResult | null }) {
  const openForReal = () => {
    const link = parseLinkHash(location.hash);
    if (!link) return;
    location.assign(buildLink(location.origin + location.pathname, link.payload));
    location.reload();
  };
  return (
    <section className="check-report island" role="region" aria-label="Check mode">
      <p className="check-report-banner">
        <strong>Check mode: nothing is saved</strong>
        <button type="button" className="btn" onClick={openForReal}>
          Open for real
        </button>
      </p>
      <div role="region" aria-label="Workflow check" aria-live="polite">
        <pre className={`check-report-text${result && !(result.ok && result.pass) ? " is-fail" : ""}`}>{result ? reportText(result) : "Workflow check: reading the link…"}</pre>
      </div>
    </section>
  );
}
