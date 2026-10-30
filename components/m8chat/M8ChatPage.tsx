import Link from "next/link";
import PageShell from "@/components/PageShell";
import Orb from "@/components/Orb";
import BookingCTA from "@/components/BookingCTA";
import LocationBeacon from "@/components/LocationBeacon";
import { hasApplicationUrl, isPlaceholder } from "@/lib/config";
import { copy } from "@/lib/copy";
import { nameableMlo } from "@/lib/mlo-match";
import { routeContext } from "@/lib/route-context";
import { sponsorFullName } from "@/lib/licensing";
import ChatHead from "./ChatHead";
import SpeakButton from "./SpeakButton";
import Composer from "./Composer";
import "./m8chat.css";

/**
 * /chat — the M8 chat (v33 design; L3: no scripted conversation).
 *
 * - The site's nav and footer, the orb header that follows M8's voice, and
 *   M8's opening message (AI disclosure first; read aloud on request).
 * - Starter cards go to the tools that answer them today (calculators,
 *   Second Look, the prep flow). Two-way chat with M8 is still in private
 *   testing (/chat?preview=1), so the composer sends the question to the
 *   visitor's licensed loan officer, who replies by email.
 * - The loan officer card is the visitor's match (location beacon, "Not
 *   right? Change"): photo, NMLS, originating company. No match yet →
 *   a generic card with the location picker.
 */
export default async function M8ChatPage() {
  const t = copy.m8chat;
  const ctx = await routeContext();
  const mlo = nameableMlo(ctx);
  const lic = mlo ? ctx.license : null;
  const photo = mlo && !isPlaceholder(mlo.photo) && mlo.photo.startsWith("/") ? mlo.photo : null;
  const intro = mlo ? t.introNamed.replaceAll("{first}", mlo.firstName) : t.intro;

  const loCard = (
    <div className="m8c-card m8c-lo">
      <p className="m8c-eyebrow">{mlo ? t.loEyebrow : t.loEyebrowGeneric}</p>
      {mlo ? (
        <>
          <div className="m8c-lo__who">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- small, local, fixed-size headshot
              <img className="m8c-photo" src={photo} alt="" width={52} height={52} />
            ) : (
              <span className="m8c-photo m8c-photo--none" aria-hidden="true" />
            )}
            <div>
              <p className="m8c-lo__name">{mlo.name}</p>
              <p className="m8c-mono">NMLS #{mlo.nmls}</p>
            </div>
          </div>
          {lic ? (
            <p className="m8c-lo__fact">
              <span>{t.originatesThrough}</span>
              <br />
              {sponsorFullName(lic.sponsor)} · {lic.sponsor.idLabel} #{lic.sponsor.idNumber}
            </p>
          ) : null}
          <p className="m8c-lo__fact">
            <span>{t.licensedIn}</span> {mlo.licenses.map((l) => l.state).join(" · ")}
          </p>
        </>
      ) : (
        <p className="m8c-lo__fact">{t.loGeneric}</p>
      )}
      <div className="m8c-lo__beacon">
        <LocationBeacon variant="card" />
      </div>
      <div className="m8c-lo__btns">
        <BookingCTA kind="borrower" variant="primary" intake={false} className="m8c-btn">
          {t.bookCall}
        </BookingCTA>
        {mlo && hasApplicationUrl(mlo) ? (
          <a className="m8c-btn m8c-btn--ghost" href={mlo.applicationUrl} target="_blank" rel="noopener noreferrer">
            {t.startApplication}
          </a>
        ) : null}
      </div>
    </div>
  );

  return (
    <PageShell>
      <div className="m8c">
        <section className="m8c-convo" aria-label={t.convoLabel}>
          <ChatHead />

          <div className="m8c-lo-mobile">{loCard}</div>

          <ol className="m8c-thread">
            <li className="m8c-msg">
              <Orb size="mark" px={28} className="m8c-avatar" />
              <div className="m8c-msg__body">
                <p className="m8c-meta">
                  <b>M8</b>
                  <SpeakButton text={intro} />
                </p>
                <p className="m8c-p">{intro}</p>
              </div>
            </li>
          </ol>

          <ul className="m8c-starters" aria-label={t.startersLabel}>
            {t.starters.map((s) => (
              <li key={s.href}>
                <Link href={s.href} className="m8c-starter">
                  <span className="m8c-starter__title">{s.label}</span>
                  <span className="m8c-starter__sub">{s.sub}</span>
                </Link>
              </li>
            ))}
          </ul>

          <Composer first={mlo?.firstName ?? null} />
        </section>

        <aside className="m8c-rail" aria-label={t.railLabel}>
          <div className="m8c-rail__inner">{loCard}</div>
        </aside>
      </div>
    </PageShell>
  );
}
