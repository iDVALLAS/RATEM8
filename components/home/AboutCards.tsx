"use client";

import { useNamedMlo, MloText } from "@/components/mlo/MloContext";

/**
 * AboutCards — the "who closes your loan" heading, sub and card
 * (v14, Edit 6). Generic until the visitor is matched (MloContext);
 * then the matched MLO's name, title, NMLS number, verify link and bio.
 * Strings arrive as props from the server component (About.tsx).
 */
type Strings = {
  heading: string;
  headingNamed: string;
  sub: string;
  subNamed: string;
  verify: string;
  bioLabel: string;
  nmlsPrefix: string;
  generic: { title: string; body: string; verify: string };
  lookupHref: string;
};

const isUrl = (s: string) => /^https?:\/\//.test(s);
const isPlaceholder = (s: string) => /^\[.*\]$/.test(s.trim());

export default function AboutCards({ s }: { s: Strings }) {
  const mlo = useNamedMlo();
  const bio = mlo && !isPlaceholder(mlo.bioShort) && mlo.bioShort ? mlo.bioShort : null;
  return (
    <>
      <div className="max-w-2xl">
        <h2 id="about-heading" className="hm-h2 mt-4">
          <MloText generic={s.heading} named={s.headingNamed} />
        </h2>
        <p className="hm-sub">
          <MloText generic={s.sub} named={s.subNamed} />
        </p>
      </div>

      <ul className="hm-about__grid list-none p-0 m-0">
        {mlo ? (
          <li className="hm-about__card">
            <div className="hm-about__id">
              <div className="hm-about__name">{mlo.name}</div>
              <div className="hm-about__title">{mlo.title}</div>
              <div className="hm-about__nmls">
                {s.nmlsPrefix}
                {mlo.nmls}
              </div>
              {isUrl(mlo.nmlsConsumerAccessUrl) ? (
                <a href={mlo.nmlsConsumerAccessUrl} target="_blank" rel="noopener noreferrer" className="hm-about__verify">
                  {s.verify}
                </a>
              ) : null}
            </div>
            {bio ? (
              <div>
                <div className="code-label">{s.bioLabel}</div>
                <p className="hm-about__bio mt-2">{bio}</p>
              </div>
            ) : null}
          </li>
        ) : (
          <li className="hm-about__card">
            <div className="hm-about__id">
              <div className="hm-about__name">{s.generic.title}</div>
              <a href={s.lookupHref} target="_blank" rel="noopener noreferrer" className="hm-about__verify">
                {s.generic.verify}
              </a>
            </div>
            <div>
              <p className="hm-about__bio">{s.generic.body}</p>
            </div>
          </li>
        )}
      </ul>
    </>
  );
}
