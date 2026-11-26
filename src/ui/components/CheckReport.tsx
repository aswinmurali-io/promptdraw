// The check-mode island: says nothing is saved and offers to open the link for real.
// @lat: [[ui#Workflow links#Check mode]]
import { buildLink, parseLinkHash } from "../lib/link";

export function CheckReport() {
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
    </section>
  );
}
