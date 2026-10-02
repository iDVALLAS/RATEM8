import { copy } from "@/lib/copy";
import { CONFIG } from "@/lib/config";
import { homeContent } from "@/lib/content/home";
import AboutCards from "./AboutCards";

/**
 * About — who closes your loan. Generic for every visitor (v14, Edit 6):
 * no individual is named until MloContext has a match, and then the card
 * shows that MLO's name with their NMLS number (AboutCards).
 *
 * Every fact (name, title, NMLS, verify link, bio) comes from CONFIG via
 * the context. Placeholders are not rendered.
 */
export default function About() {
  const a = copy.about;
  return (
    <section id="about" className="hm-rule hm-section" aria-labelledby="about-heading">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="eyebrow">{a.eyebrow}</div>
        <AboutCards
          s={{
            heading: a.heading,
            headingNamed: a.headingNamed,
            sub: a.sub,
            subNamed: a.subNamed,
            verify: a.verify,
            bioLabel: a.bioLabel,
            nmlsPrefix: homeContent.about.nmlsPrefix,
            generic: a.genericCard,
            lookupHref: CONFIG.nmlsConsumerAccessHome,
          }}
        />
        {/* v19 (Item 3a): the overhead / savings idea, generic for every visitor. */}
        <p className="hm-sub hm-about__savings max-w-2xl">{copy.savings.about}</p>
      </div>
    </section>
  );
}
