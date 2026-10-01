import Reveal from "@/components/motion/Reveal";
import { copy } from "@/lib/copy";
import HeroOrb from "./HeroOrb";
import ActionGrid from "./ActionGrid";
import TrustStrip from "./TrustStrip";
import LocationBeacon from "@/components/LocationBeacon";

/**
 * Hero — the tappable orb over the drifting term field, the
 * word-by-word headline, the sub, the four-button grid and the trust
 * strip. (The mono eyebrow and the italic tagline line were removed at
 * the owner's request; the tagline still lives in the footer/metadata.)
 *
 * Server component. Only HeroOrb and Reveal ship JS.
 */
/** Fingerprint line-mark: concentric arcs, currentColor, aria-hidden. */
function FingerprintMark() {
  return (
    <svg aria-hidden="true" className="hm-hero__fp" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5v1.2" />
      <path d="M4.2 9.2A8.5 8.5 0 0 1 8 4.6" />
      <path d="M12 6.5a5.5 5.5 0 0 1 5.5 5.5c0 2.2-.3 4.3-.9 6.3" />
      <path d="M6.5 12a5.5 5.5 0 0 1 1.5-3.8" />
      <path d="M12 9.5a2.5 2.5 0 0 1 2.5 2.5c0 3-.5 5.7-1.5 8" />
      <path d="M9.5 12c0 3.3-.6 6.2-1.8 8.5" />
      <path d="M12 12.6c0 2.3-.3 4.4-.9 6.4" />
    </svg>
  );
}

export default function Hero() {
  return (
    <section className="hm-hero">
      <div aria-hidden="true" className="hm-hero__glow" />

      <div className="hm-hero__inner relative mx-auto max-w-4xl px-4 sm:px-6 text-center">
        <div className="hm-in hm-hero__orbcol" style={{ "--d": "0ms" } as React.CSSProperties}>
          <HeroOrb
            ariaLabel={copy.hero.orbAriaLabel}
            voiceLabel={copy.hero.voiceLabel}
            qaLabel={copy.hero.qaLabel}
            voicePopup={copy.hero.voicePopup}
            qaPopup={copy.hero.qaPopup}
            cancelLabel={copy.hero.popupCancel}
            redirectNote={copy.hero.popupRedirectNote}
          />
        </div>

        <div className="mt-4 sm:mt-5">
          <Reveal as="h1" text={copy.hero.tagline} immediate delay={200} className="tagline text-5xl sm:text-7xl" />
          <p className="hm-hero__auth hm-in" style={{ "--d": "260ms" } as React.CSSProperties}>
            <FingerprintMark />
            <span className="hm-hero__auth-word">{copy.hero.authWord}</span>{" "}
            <span className="hm-hero__auth-rest">{copy.hero.authLine.replace(copy.hero.authWord, "").trim()}</span>
          </p>
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
        {/* v15 location beacon on phones (desktop has it in the nav). */}
        <div className="lg:hidden">
          <LocationBeacon variant="inline" className="hm-beacon" />
        </div>
      </div>
    </section>
  );
}
