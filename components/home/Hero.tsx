import Reveal from "@/components/motion/Reveal";
import BookingCTA from "@/components/BookingCTA";
import { copy } from "@/lib/copy";
import { homeContent } from "@/lib/content/home";
import HeroOrb from "./HeroOrb";
import ActionGrid from "./ActionGrid";
import TrustStrip from "./TrustStrip";

/**
 * Hero — eyebrow, the tappable orb over the drifting term field, the
 * word-by-word headline, the italic accent line, the sub, the
 * four-button grid and the trust strip.
 *
 * Server component. Only HeroOrb and Reveal ship JS.
 */
export default function Hero() {
  return (
    <section className="hm-hero">
      <div aria-hidden="true" className="hm-hero__glow" />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 pt-12 pb-16 sm:pt-20 sm:pb-24 text-center">
        <p className="eyebrow hm-in" style={{ "--d": "0ms" } as React.CSSProperties}>
          {copy.hero.eyebrow}
        </p>

        <div className="mt-10 sm:mt-12 hm-in" style={{ "--d": "60ms" } as React.CSSProperties}>
          <HeroOrb
            caption={copy.hero.orbCaption}
            cardLabel={homeContent.hero.orbCardLabel}
            cardTitle={copy.hero.orbCardTitle}
            cardBody={copy.hero.orbCardBody}
            dismissLabel={copy.hero.orbCardDismiss}
            ariaLabel={homeContent.hero.orbAriaLabel}
            ariaLabelOpen={homeContent.hero.orbAriaLabelOpen}
            cta={
              <BookingCTA kind="borrower" variant="pill" ariaLabel={copy.hero.orbCardCta}>
                {copy.hero.orbCardCta}
              </BookingCTA>
            }
          />
        </div>

        <div className="mt-10 sm:mt-12">
          <Reveal as="h1" text={copy.hero.tagline} immediate delay={200} className="tagline text-5xl sm:text-7xl" />
          <p className="hm-hero__emphasis hm-in" style={{ "--d": "160ms" } as React.CSSProperties}>
            <em className="accent-word">{copy.hero.taglineEmphasis}</em>
          </p>
        </div>

        <p className="hm-hero__sub">
          {copy.hero.sub}
        </p>

        <div className="hm-in" style={{ "--d": "220ms" } as React.CSSProperties}>
          <ActionGrid />
        </div>

        <div className="hm-in" style={{ "--d": "280ms" } as React.CSSProperties}>
          <TrustStrip />
        </div>
      </div>
    </section>
  );
}
