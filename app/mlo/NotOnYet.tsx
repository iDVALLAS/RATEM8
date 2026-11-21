import Link from "next/link";
import { Icon } from "./icons";
import type { IconName } from "./nav";
import { NOT_ON_YET, TECH_SUMMARY, type NotOnYetKey } from "@/lib/content/cc-pages";

/**
 * D76: owner-only technical steps. Rendered only for the owner, folded, so
 * the daily pages never show platform settings or variable names to a loan
 * officer. A test (app/mlo/plain-language.test.ts) skips text inside it.
 */
export function TechSteps({ owner, children, open = false }: { owner: boolean; children: React.ReactNode; open?: boolean }) {
  if (!owner) return null;
  return (
    <details className="cc-tech" open={open}>
      <summary>{TECH_SUMMARY}</summary>
      <div className="cc-tech__body">{children}</div>
    </details>
  );
}

/**
 * D76: a feature that isn't turned on yet, in one sentence, with one way
 * forward: the setup assistant, opened on that topic. Today's setup steps
 * stay available to the owner in a folded "Technical steps".
 */
export default function NotOnYet({ what, icon, owner, children }: { what: NotOnYetKey; icon: IconName; owner: boolean; children?: React.ReactNode }) {
  const c = NOT_ON_YET[what];
  return (
    <section className="mlo-section cc-noton" aria-label={c.line}>
      <div className="cc-noton__row">
        <span className="cc-noton__icon" aria-hidden="true"><Icon name={icon} size={22} /></span>
        <div className="cc-noton__text">
          <p className="cc-noton__line">{c.line}</p>
          {c.after ? <p className="mlo-note">{owner ? c.after.owner : c.after.lo}</p> : null}
        </div>
      </div>
      <div className="mlo-actions">
        <Link className="mlo-btn" href={`/mlo/setup-help?topic=${c.topic}`}>Set it up with the assistant</Link>
      </div>
      {children ? <TechSteps owner={owner}>{children}</TechSteps> : null}
    </section>
  );
}
