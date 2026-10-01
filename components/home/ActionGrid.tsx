import BookingCTA from "@/components/BookingCTA";
import CTAButton from "@/components/CTAButton";
import { copy } from "@/lib/copy";
import { homeContent } from "@/lib/content/home";

/**
 * ActionGrid — the four-button grid. Two columns on every viewport,
 * each row-2 button directly under its parent:
 *
 *   [ I'm shopping a mortgage (primary) ] [ I'm a real estate agent (secondary) ]
 *   [ Get a second look (outline, LE)   ] [ I'm a hungry MLO (outline, //)     ]
 *
 * Row 2 is outlined + mono icon: distinct, never louder than primary.
 * The hero is an intake point, so the trust line (copy.hero.trustLine,
 * starting with "This is not a credit pull") sits under the grid once,
 * spanning both columns.
 */
export default function ActionGrid() {
  return (
    <nav aria-label={homeContent.hero.gridLabel}>
      <div className="hm-grid">
        <BookingCTA kind="borrower" variant="primary" intake={false}>
          {copy.hero.borrowerCta}
        </BookingCTA>
        <CTAButton href="/agents" variant="secondary">
          {copy.hero.agentCta}
        </CTAButton>
        <CTAButton href="/second-look" variant="outline" icon="LE" sub={copy.hero.secondLookSub}>
          {copy.hero.secondLookCta}
        </CTAButton>
        <CTAButton href="/join" variant="outline" icon="//" sub={copy.hero.mloSub}>
          {copy.hero.mloCta}
        </CTAButton>
      </div>
      {/* Non-breaking spaces inside each phrase: the line wraps only at the dots. */}
      <p className="hm-grid__note">
        {copy.hero.trustLine.map((item, i) => (
          <span key={item}>
            {i > 0 ? " · " : null}
            {item.replace(/ /g, "\u00a0")}
          </span>
        ))}
      </p>
    </nav>
  );
}
