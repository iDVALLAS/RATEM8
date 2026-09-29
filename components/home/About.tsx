import { copy } from "@/lib/copy";
import { ALL_MLOS, HAS_TEAM, isPlaceholder } from "@/lib/config";
import { homeContent } from "@/lib/content/home";

/**
 * About — who closes your loan. One card per MLO from ALL_MLOS
 * (principal first). Works for one or many: with a team the heading
 * and sub switch (see copy.about) and the grid goes two-up.
 *
 * Every fact (name, title, NMLS, verify link, bio) comes from CONFIG.
 * Placeholders are not rendered.
 */
export default function About() {
  return (
    <section id="about" className="hm-rule hm-section" aria-labelledby="about-heading">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <div className="eyebrow">{copy.about.eyebrow}</div>
          <h2 id="about-heading" className="hm-h2 mt-4">
            {copy.about.heading}
          </h2>
          <p className="hm-sub">{copy.about.sub}</p>
        </div>

        <ul className={`hm-about__grid list-none p-0 m-0 ${HAS_TEAM ? "hm-about__grid--team" : ""}`}>
          {ALL_MLOS.map((m) => {
            const verifiable = !isPlaceholder(m.nmlsConsumerAccessUrl) && /^https?:\/\//.test(m.nmlsConsumerAccessUrl);
            const bio = isPlaceholder(m.bioShort) ? null : m.bioShort;
            return (
              <li key={m.nmls} className="hm-about__card">
                <div className="hm-about__id">
                  <div className="hm-about__name">{m.name}</div>
                  <div className="hm-about__title">{m.title}</div>
                  <div className="hm-about__nmls">
                    {homeContent.about.nmlsPrefix}
                    {m.nmls}
                  </div>
                  {verifiable ? (
                    <a href={m.nmlsConsumerAccessUrl} target="_blank" rel="noopener noreferrer" className="hm-about__verify">
                      {copy.about.verify}
                    </a>
                  ) : null}
                </div>
                {bio ? (
                  <div>
                    <div className="code-label">{copy.about.bioLabel}</div>
                    <p className="hm-about__bio mt-2">{bio}</p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
