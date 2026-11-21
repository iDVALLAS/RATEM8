import { groupLabelOf } from "./nav";
import { HOW_SUMMARY } from "@/lib/content/cc-pages";

/**
 * D76: the top of every Command Center page. The eyebrow is the page's
 * group in the menu ("Your day", "People", "Settings"), then the title, an
 * optional one-line sub and an optional main action. A long explanation
 * goes in `how`, folded under "How this works" so the work comes first.
 */
export default function PageHead({
  k,
  eyebrow,
  title,
  sub,
  action,
  how,
}: {
  /** The page's key in app/mlo/nav.ts (sets the eyebrow). */
  k?: string;
  /** Overrides the eyebrow (a back link on a page under another one). */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  action?: React.ReactNode;
  how?: React.ReactNode;
}) {
  const brow = eyebrow ?? (k ? groupLabelOf(k) : null);
  return (
    <>
      <header className="cc-head">
        <div className="cc-head__text">
          {brow ? <p className="eyebrow">{brow}</p> : null}
          <h1 className="tagline text-4xl">{title}</h1>
          {sub ? <p className="cc-head__sub">{sub}</p> : null}
        </div>
        {action ? <div className="cc-head__action">{action}</div> : null}
      </header>
      {how ? (
        <details className="cc-how">
          <summary><span className="cc-how__i" aria-hidden="true">i</span>{HOW_SUMMARY}</summary>
          <div className="cc-how__body">{how}</div>
        </details>
      ) : null}
    </>
  );
}
