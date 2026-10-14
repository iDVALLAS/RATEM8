import CTAButton from "@/components/CTAButton";
import TrustLine from "@/components/TrustLine";
import { copy } from "@/lib/copy";
import { homeContent } from "@/lib/content/home";

/**
 * ActionGrid — the four-button grid. Two columns on every viewport,
 * each row-2 button directly under its parent:
 *
 *   [ I'm shopping a mortgage (primary) ] [ I'm a real estate agent (secondary) ]
 *     → /chat, the scripted demo (v21)
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
        {/* v21: the scripted demo, not the booking link (the demo has its own "Book a call"). */}
        <CTAButton href="/chat" variant="primary">
          {copy.hero.borrowerCta}
        </CTAButton>
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
      <TrustLine className="hm-grid__note" />
    </nav>
  );
}
