import Reveal from "@/components/motion/Reveal";
import { copy } from "@/lib/copy";
import { CONFIG, hasBooking } from "@/lib/config";
import { homeContent } from "@/lib/content/home";
import HeroOrb from "./HeroOrb";
import ActionGrid from "./ActionGrid";
import TrustStrip from "./TrustStrip";

/**
 * Hero — the tappable orb over the drifting term field, the
 * word-by-word headline, the sub, the four-button grid and the trust
 * strip. (The mono eyebrow and the italic tagline line were removed at
 * the owner's request; the tagline still lives in the footer/metadata.)
 *
 * Server component. Only HeroOrb and Reveal ship JS.
 */
export default function Hero() {
  return (
    <section className="hm-hero">
      <div aria-hidden="true" className="hm-hero__glow" />

      <div className="hm-hero__inner relative mx-auto max-w-4xl px-4 sm:px-6 text-center">
        <div className="hm-in" style={{ "--d": "0ms" } as React.CSSProperties}>
          <HeroOrb
            ariaLabel={homeContent.hero.orbAriaLabel}
            voiceLabel={copy.hero.voiceLabel}
            qaLabel={copy.hero.qaLabel}
            voiceMessage={copy.hero.voiceComingSoon}
            qaComingSoon={copy.hero.qaComingSoon}
            aiNote={copy.footer.aiNote}
            qaHref={hasBooking(CONFIG.calendly.borrower) ? CONFIG.calendly.borrower : null}
          />
        </div>

        <div className="mt-8 sm:mt-10">
          <Reveal as="h1" text={copy.hero.tagline} immediate delay={200} className="tagline text-5xl sm:text-7xl" />
        </div>

        <p className="hm-hero__sub">
          {copy.hero.sub}
        </p>

        <div className="hm-in" style={{ "--d": "220ms" } as React.CSSProperties}>
          <ActionGrid />
        </div>
      </div>

      {/* Trust strip sits below the first viewport on purpose: the first
          screen is orb → headline → the four actions, nothing else. */}
      <div className="hm-trust-band mx-auto max-w-4xl px-4 sm:px-6 text-center">
        <TrustStrip />
      </div>
    </section>
  );
}
